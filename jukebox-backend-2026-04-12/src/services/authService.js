const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { signToken } = require('../utils/jwt');
const { stripeClient } = require('../lib/stripe');
const { env } = require('../config/env');

const SLUG_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;
const VALID_PLANS = ['free', 'pro'];

const normalizePlan = (plan) => (VALID_PLANS.includes(plan) ? plan : 'free');

const getUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] ?? null;
};

const getJukeboxBySlug = async (slug) => {
  const [rows] = await pool.query('SELECT * FROM jukeboxes WHERE slug = ?', [slug]);
  return rows[0] ?? null;
};

const buildTokenPayload = (user, jukebox) => ({
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  role: user.role,
  plan: user.plan,
  jukebox_id: jukebox?.id ?? null,
  jukebox_slug: jukebox?.slug ?? null,
  jukebox_name: jukebox?.name ?? null,
  stripe_onboarding_complete: Boolean(user.stripe_onboarding_complete),
  stripe_payouts_enabled: Boolean(user.stripe_payouts_enabled),
  stripe_account_id: user.stripe_account_id ?? null,
});

const sanitizeUser = (user, jukebox) => ({
  user_id: user.user_id,
  email: user.email,
  username: user.username,
  role: user.role,
  plan: user.plan,
  plan_status: user.plan_status,
  stripe_account_id: user.stripe_account_id ?? null,
  stripe_onboarding_complete: Boolean(user.stripe_onboarding_complete),
  stripe_payouts_enabled: Boolean(user.stripe_payouts_enabled),
  jukebox: jukebox
    ? {
        id: jukebox.id,
        slug: jukebox.slug,
        name: jukebox.name,
        location: jukebox.location,
        avatar: jukebox.avatar ?? null,
      }
    : null,
});

const JUKEBOX_FOR_AUTH_SELECT = `SELECT id, slug, name, location, avatar FROM jukeboxes`;

/** Jukebox possédé ; sinon celui indiqué par users.default_jukebox_id (seed admin, staff). */
const resolveJukeboxForUser = async (user) => {
  const [ownedRows] = await pool.query(`${JUKEBOX_FOR_AUTH_SELECT} WHERE owner_user_id = ? LIMIT 1`, [
    user.user_id,
  ]);
  if (ownedRows[0]) {
    return ownedRows[0];
  }
  if (user.default_jukebox_id) {
    const [defRows] = await pool.query(`${JUKEBOX_FOR_AUTH_SELECT} WHERE id = ? LIMIT 1`, [user.default_jukebox_id]);
    return defRows[0] ?? null;
  }
  return null;
};

const fetchUserWithJukebox = async (userId) => {
  const [userRows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
  if (!userRows.length) {
    return null;
  }
  const user = userRows[0];
  const jukebox = await resolveJukeboxForUser(user);
  return { user, jukebox };
};

const register = async ({ username, email, password, jukeboxName, slug, plan = 'free', avatar = null }) => {
  if (!email || !password || !username || !jukeboxName || !slug) {
    const error = new Error('Missing required fields');
    error.statusCode = 400;
    throw error;
  }

  if (!SLUG_REGEX.test(slug)) {
    const error = new Error('Slug invalide. Utilisez uniquement lettres, chiffres, tirets et soulignés.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedSlug = slug.toLowerCase();
  const existingEmail = await getUserByEmail(email);
  if (existingEmail) {
    const error = new Error('Un utilisateur existe déjà avec ce courriel.');
    error.statusCode = 409;
    throw error;
  }

  const existingSlug = await getJukeboxBySlug(normalizedSlug);
  if (existingSlug) {
    const error = new Error('Ce slug est déjà pris.');
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const normalizedPlan = normalizePlan(plan);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [userResult] = await connection.query(
      `INSERT INTO users (username, email, password_hash, role, plan, plan_status)
       VALUES (?, ?, ?, 'jukebox_owner', ?, 'active')`,
      [username, email, hashedPassword, normalizedPlan],
    );
    const userId = userResult.insertId;

    const [jukeboxResult] = await connection.query(
      `INSERT INTO jukeboxes (slug, name, owner_user_id, avatar)
       VALUES (?, ?, ?, ?)`,
      [normalizedSlug, jukeboxName, userId, avatar],
    );
    const jukeboxId = jukeboxResult.insertId;

    await connection.query('UPDATE users SET default_jukebox_id = ? WHERE user_id = ?', [jukeboxId, userId]);

    await connection.commit();

    const user = {
      user_id: userId,
      username,
      email,
      role: 'jukebox_owner',
      plan: normalizedPlan,
      plan_status: 'active',
      stripe_account_id: null,
      stripe_onboarding_complete: 0,
      stripe_payouts_enabled: 0,
    };
    const jukebox = {
      id: jukeboxId,
      slug: normalizedSlug,
      name: jukeboxName,
      avatar: avatar,
    };
    const token = signToken(buildTokenPayload(user, jukebox));
    return {
      token,
      user: sanitizeUser(user, jukebox),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const login = async ({ email, password }) => {
  const user = await getUserByEmail(email);
  if (!user) {
    const error = new Error('Identifiants invalides');
    error.statusCode = 401;
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const error = new Error('Identifiants invalides');
    error.statusCode = 401;
    throw error;
  }

  const jukebox = await resolveJukeboxForUser(user);
  if (jukebox && !user.default_jukebox_id) {
    await pool.query('UPDATE users SET default_jukebox_id = ? WHERE user_id = ?', [jukebox.id, user.user_id]);
  }

  const token = signToken(buildTokenPayload(user, jukebox));
  return {
    token,
    user: sanitizeUser(user, jukebox),
  };
};

const getProfileById = async (userId) => {
  const data = await fetchUserWithJukebox(userId);
  if (!data) {
    const error = new Error('Utilisateur introuvable');
    error.statusCode = 404;
    throw error;
  }
  return sanitizeUser(data.user, data.jukebox);
};

const updatePlan = async ({ userId, plan }) => {
  const normalizedPlan = normalizePlan(plan);

  const [currentRows] = await pool.query('SELECT plan FROM users WHERE user_id = ? LIMIT 1', [
    userId,
  ]);
  const current = currentRows[0];
  if (!current) {
    const error = new Error('Utilisateur introuvable');
    error.statusCode = 404;
    throw error;
  }

  let stripeCanceled = null;

  // Si l'utilisateur passe de Pro à Free, on tente d'annuler son abonnement Stripe associé.
  if (current.plan === 'pro' && normalizedPlan === 'free' && stripeClient && env.STRIPE_PRO_PRICE_ID) {
    try {
      const subscriptions = await stripeClient.subscriptions.list({
        status: 'active',
        limit: 100,
      });
      const userIdStr = String(userId);
      const matching = subscriptions.data.filter(
        (subscription) =>
          subscription.metadata?.user_id === userIdStr &&
          subscription.items?.data?.some((item) => item.price?.id === env.STRIPE_PRO_PRICE_ID),
      );
      await Promise.all(matching.map((subscription) => stripeClient.subscriptions.cancel(subscription.id)));
      stripeCanceled = matching.length > 0;
    } catch (error) {
      // En environnement de test, on ne bloque pas la mise à jour du plan
      // si l'annulation Stripe échoue, mais on pourrait journaliser l'erreur.
      // eslint-disable-next-line no-console
      console.error('Erreur lors de l’annulation de la souscription Stripe:', error.message || error);
    }
  }

  if (current.plan === normalizedPlan) {
    // Rien à faire, on renvoie simplement le profil actuel.
    const data = await fetchUserWithJukebox(userId);
    return {
      token: signToken(buildTokenPayload(data.user, data.jukebox)),
      user: sanitizeUser(data.user, data.jukebox),
    };
  }

  await pool.query(
    `UPDATE users
       SET plan = ?, plan_status = 'active'
     WHERE user_id = ?`,
    [normalizedPlan, userId],
  );

  const data = await fetchUserWithJukebox(userId);
  if (!data) {
    const error = new Error('Utilisateur introuvable');
    error.statusCode = 404;
    throw error;
  }

  const token = signToken(buildTokenPayload(data.user, data.jukebox));
  return {
    token,
    user: sanitizeUser(data.user, data.jukebox),
    stripeCanceled,
  };
};

const updateProfile = async ({ userId, username, email, jukeboxName }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Vérifier les conflits uniques
    if (email) {
      const [existingEmail] = await connection.query(
        'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
        [email, userId],
      );
      if (existingEmail.length > 0) {
        await connection.rollback();
        const error = new Error('Un utilisateur existe déjà avec ce courriel.');
        error.statusCode = 409;
        throw error;
      }
    }

    if (username) {
      const [existingUsername] = await connection.query(
        'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
        [username, userId],
      );
      if (existingUsername.length > 0) {
        await connection.rollback();
        const error = new Error('Ce nom d\'utilisateur est déjà pris.');
        error.statusCode = 409;
        throw error;
      }
    }

    // Mettre à jour l'utilisateur
    const updates = [];
    const values = [];
    if (username) {
      updates.push('username = ?');
      values.push(username);
    }
    if (email) {
      updates.push('email = ?');
      values.push(email);
    }
    if (updates.length > 0) {
      values.push(userId);
      await connection.query(
        `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`,
        values,
      );
    }

    // Mettre à jour le jukebox si nécessaire
    if (jukeboxName) {
      await connection.query(
        'UPDATE jukeboxes SET name = ? WHERE owner_user_id = ?',
        [jukeboxName, userId],
      );
    }

    await connection.commit();

    const data = await fetchUserWithJukebox(userId);
    if (!data) {
      const error = new Error('Utilisateur introuvable');
      error.statusCode = 404;
      throw error;
    }

    const token = signToken(buildTokenPayload(data.user, data.jukebox));
    return {
      token,
      user: sanitizeUser(data.user, data.jukebox),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const deleteProfile = async ({ userId, password }) => {
  // Vérifier le mot de passe
  const [userRows] = await pool.query('SELECT password_hash, plan FROM users WHERE user_id = ?', [userId]);
  if (!userRows.length) {
    const error = new Error('Utilisateur introuvable');
    error.statusCode = 404;
    throw error;
  }

  const isValid = await bcrypt.compare(password, userRows[0].password_hash);
  if (!isValid) {
    const error = new Error('Mot de passe incorrect');
    error.statusCode = 401;
    throw error;
  }

  // Récupérer le slug du jukebox de l'utilisateur
  const [jukeboxRows] = await pool.query(
    'SELECT slug FROM jukeboxes WHERE owner_user_id = ? LIMIT 1',
    [userId],
  );
  
  if (jukeboxRows.length > 0 && jukeboxRows[0].slug === 'lemonarch') {
    const error = new Error('Le compte lemonarch ne peut pas être supprimé.');
    error.statusCode = 403;
    throw error;
  }

  // Annuler automatiquement l'abonnement Stripe Pro si l'utilisateur a un plan Pro
  if (userRows[0].plan === 'pro' && stripeClient && env.STRIPE_PRO_PRICE_ID) {
    try {
      const subscriptions = await stripeClient.subscriptions.list({
        status: 'active',
        limit: 100,
      });
      const userIdStr = String(userId);
      const matching = subscriptions.data.filter(
        (subscription) =>
          subscription.metadata?.user_id === userIdStr &&
          subscription.items?.data?.some((item) => item.price?.id === env.STRIPE_PRO_PRICE_ID),
      );
      await Promise.all(matching.map((subscription) => stripeClient.subscriptions.cancel(subscription.id)));
      // eslint-disable-next-line no-console
      console.log(`Abonnement Stripe Pro annulé pour l'utilisateur ${userId} avant suppression du compte`);
    } catch (error) {
      // On journalise l'erreur mais on continue la suppression du compte
      // eslint-disable-next-line no-console
      console.error('Erreur lors de l\'annulation de la souscription Stripe avant suppression:', error.message || error);
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Fonction helper pour supprimer de manière sécurisée (ignore si la table n'existe pas)
    const safeDelete = async (tableName, whereClause, params) => {
      try {
        await connection.query(`DELETE FROM ${tableName} WHERE ${whereClause}`, params);
      } catch (err) {
        // Si la table n'existe pas (ER_NO_SUCH_TABLE) ou autre erreur non critique, on continue
        if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
          // eslint-disable-next-line no-console
          console.warn(`Table ${tableName} n'existe pas ou colonne manquante, ignorée lors de la suppression du compte`);
        } else {
          // Pour les autres erreurs, on relance
          throw err;
        }
      }
    };

    // Supprimer les réservations de solde (priorités et achats de titres)
    await safeDelete('balance_reservations', 'user_id = ?', [userId]);

    // Supprimer les investissements dans les chansons
    await safeDelete('song_investments', 'user_id = ?', [userId]);

    // Supprimer les transactions de portefeuille
    await safeDelete('wallet', 'user_user_id = ?', [userId]);

    // Supprimer les parts de revenus
    await safeDelete('revenue_shares', 'user_id = ?', [userId]);

    // Supprimer les payouts
    await safeDelete('payouts', 'user_id = ?', [userId]);

    // Supprimer les snapshots de priorité (via jukebox)
    // On supprime d'abord les jukeboxes, ce qui déclenchera CASCADE sur priority_order_snapshots

    // Supprimer les chansons de l'utilisateur (cascade supprimera jukebox_songs)
    await safeDelete('songs', 'user_id = ?', [userId]);

    // Supprimer le jukebox (cascade supprimera jukebox_songs)
    await connection.query(
      'DELETE FROM jukeboxes WHERE owner_user_id = ?',
      [userId],
    );

    // Supprimer l'utilisateur
    await connection.query(
      'DELETE FROM users WHERE user_id = ?',
      [userId],
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  register,
  login,
  getProfileById,
  updatePlan,
  updateProfile,
  deleteProfile,
};


