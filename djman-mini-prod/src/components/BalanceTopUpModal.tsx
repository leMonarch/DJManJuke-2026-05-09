import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import toast from 'react-hot-toast';
import { getStripe } from '../services/stripeService';
import { paymentService } from '../services/paymentService';
import { BALANCE_REFRESH_EVENT } from '../constants/jukebox';

type BalanceTopUpModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type BalanceTopUpFormProps = {
  paymentIntentId: string;
  amount: number;
  onClose: () => void;
};

const BalanceTopUpForm = ({ paymentIntentId, amount, onClose }: BalanceTopUpFormProps) => {
  const stripeHooks = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripeHooks || !elements) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripeHooks.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message ?? 'Le paiement a échoué. Veuillez réessayer.');
        setIsSubmitting(false);
        return;
      }

      if (!paymentIntent || paymentIntent.status !== 'succeeded') {
        setError('Le paiement ne peut pas être confirmé pour le moment.');
        setIsSubmitting(false);
        return;
      }

      await paymentService.confirmBalanceTopUp(paymentIntent.id ?? paymentIntentId);
      window.dispatchEvent(new Event(BALANCE_REFRESH_EVENT));
      toast.success(`Solde crédité de ${formatAmount(amount)}.`);
      onClose();
    } catch {
      const message = "Une erreur est survenue pendant le paiement. Veuillez réessayer.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAmount = (value: number) =>
    value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-white/70 sm:text-base">
        Tu es sur le point d'ajouter{' '}
        <span className="font-semibold text-white">{formatAmount(amount)}</span> à ton solde PlaceJukebox.
      </p>
      <div className="rounded-lg border border-white/20 bg-black/40 p-3 sm:p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <button
          type="submit"
          disabled={isSubmitting || !stripeHooks}
          className="min-h-[44px] flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Traitement…' : 'Payer et créditer mon solde'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onClose}
          className="min-h-[44px] flex-1 rounded-full border border-white/30 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </form>
  );
};

export const BalanceTopUpModal = ({ isOpen, onClose }: BalanceTopUpModalProps) => {
  const [amount, setAmount] = useState<number>(10);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStripe().then((instance) => {
      if (cancelled) return;
      setStripe(instance);
      setStripeReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setClientSecret(null);
      setPaymentIntentId(null);
      setInitError(null);
      setIsInitializing(false);
      return;
    }

    setClientSecret(null);
    setPaymentIntentId(null);
    setInitError(null);

    let cancelled = false;

    const run = async () => {
      if (!stripe) {
        return;
      }
      setIsInitializing(true);
      try {
        const result = await paymentService.createBalanceTopUp(amount);
        if (cancelled) return;
        setClientSecret(result.clientSecret);
        setPaymentIntentId(result.paymentIntentId);
      } catch (err: unknown) {
        if (cancelled) return;
        const ax = err as { response?: { data?: { message?: string }; status?: number }; message?: string };
        const apiMsg = ax?.response?.data?.message;
        const fallback =
          ax?.response?.status === 500
            ? 'Paiement indisponible (Stripe non configuré côté serveur ou erreur API).'
            : "Impossible d'initier le paiement. Veuillez réessayer.";
        setInitError(typeof apiMsg === 'string' && apiMsg.trim() ? apiMsg : fallback);
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isOpen, amount, stripe]);

  if (!isOpen) {
    return null;
  }

  const formatAmount = (value: number) =>
    value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

  const packages = [5, 10, 20, 50];

  const stripeJsMissing = stripeReady && !stripe;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 px-4 py-4 sm:px-4 sm:pt-24">
      <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-dark p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white sm:text-lg">Augmenter mon solde</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/60 hover:text-white transition rounded-lg hover:bg-white/10"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="mb-4 space-y-3">
          <p className="text-sm text-white/70 sm:text-base">Choisis un montant à ajouter à ton solde :</p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {packages.map((pkg) => (
              <button
                key={pkg}
                type="button"
                onClick={() => setAmount(pkg)}
                className={`min-h-[44px] rounded-full px-4 py-2 text-sm font-semibold transition ${
                  amount === pkg
                    ? 'bg-secondary text-dark'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {formatAmount(pkg)}
              </button>
            ))}
          </div>
        </div>

        {!stripeReady ? (
          <p className="text-sm text-white/70">Chargement de Stripe…</p>
        ) : stripeJsMissing ? (
          <p className="text-sm text-red-400">
            Clé publique Stripe manquante ou invalide. Ajoute <code className="text-xs">VITE_STRIPE_PUBLISHABLE_KEY</code>{' '}
            dans <code className="text-xs">.env</code> ou <code className="text-xs">.env.local</code>, puis redémarre Vite.
          </p>
        ) : initError ? (
          <p className="text-sm text-red-400">{initError}</p>
        ) : !stripe || isInitializing || !clientSecret || !paymentIntentId ? (
          <p className="text-sm text-white/70">Préparation du formulaire de paiement sécurisé…</p>
        ) : (
          <Elements stripe={stripe} options={{ clientSecret, locale: 'fr-CA' }}>
            <BalanceTopUpForm paymentIntentId={paymentIntentId} amount={amount} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  );
};
