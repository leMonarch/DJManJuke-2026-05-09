import { useEffect, useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useJukebox } from '../context/JukeboxContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { paymentService } from '../services/paymentService';
import { PLAYLIST_REFRESH_EVENT } from '../constants/jukebox';
import { getStripe } from '../services/stripeService';
import { buildFiveWaySplitMessage } from '../utils/revenueMessages';

const formatAmount = (amount: number) => amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' });

type PaymentModalProps = {
  slug: string;
};

const stripePromise = getStripe();

type PriorityPaymentFormProps = {
  slug: string;
  paymentIntentId: string;
  mode: 'authenticated' | 'guest';
};

const PriorityPaymentForm = ({ slug: _slug, paymentIntentId, mode }: PriorityPaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { payment, closePaymentModal } = useJukebox();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payment.selectedTrack) {
    return null;
  }

  const { selectedTrack: _selectedTrack, amount } = payment;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          // Pas de redirection : on reste dans le flux in-app.
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      // Normalement, Stripe renvoie un paymentIntent "succeeded" en cas de succès.
      // Mais pour certaines erreurs (payment_intent_unexpected_state), cela signifie
      // simplement que le PaymentIntent a déjà été confirmé avec succès. Dans ce cas
      // on ne bloque pas l'utilisateur : on utilise l'ID déjà connu.
      if (stripeError) {
        const errorCode = (stripeError as any).code;
        if (errorCode !== 'payment_intent_unexpected_state') {
          setError(stripeError.message ?? 'Le paiement a échoué. Veuillez réessayer.');
          setIsSubmitting(false);
          return;
        }
      }

      const finalPaymentIntentId = paymentIntent?.id ?? paymentIntentId;

      if (!finalPaymentIntentId) {
        setError('Le paiement ne peut pas être confirmé pour le moment.');
        setIsSubmitting(false);
        return;
      }

      if (mode === 'guest') {
        await paymentService.confirmPriorityPaymentGuest(finalPaymentIntentId);
      } else {
        await paymentService.confirmPriorityPayment(finalPaymentIntentId);
      }
      window.dispatchEvent(new Event(PLAYLIST_REFRESH_EVENT));
      closePaymentModal();
      const revenueMessage = buildFiveWaySplitMessage(amount);
      toast.success(revenueMessage);
    } catch {
      const message = "Une erreur est survenue pendant le paiement. Veuillez réessayer.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-white/70 sm:text-base">
        Paiement de <span className="font-semibold text-white">{formatAmount(amount)}</span> pour prioriser cette chanson dans la playlist.
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
          disabled={isSubmitting || !stripe}
          className="min-h-[44px] flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Traitement…' : 'Payer et prioriser'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={closePaymentModal}
          className="min-h-[44px] flex-1 rounded-full border border-white/30 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </form>
  );
};

export const PaymentModal = ({ slug }: PaymentModalProps) => {
  const { payment, closePaymentModal } = useJukebox();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // À chaque ouverture du modal (ou changement de piste / montant),
  // on réinitialise les identifiants Stripe afin de créer
  // un NOUVEAU PaymentIntent. Cela évite de réutiliser un
  // PaymentIntent déjà "succeeded", qui provoquerait
  // l'erreur payment_intent_unexpected_state.
  useEffect(() => {
    if (!payment.isOpen || !payment.selectedTrack) {
      return;
    }
    setClientSecret(null);
    setPaymentIntentId(null);
    setInitError(null);
    setIsInitializing(false);
  }, [payment.isOpen, payment.selectedTrack?.id, payment.amount, slug]);

  useEffect(() => {
    const initializePaymentIntent = async () => {
      if (!payment.isOpen || !payment.selectedTrack || isInitializing || clientSecret) {
        return;
      }
      setIsInitializing(true);
      setInitError(null);
      try {
        const args: [number, number, string, number | null] = [
          payment.selectedTrack.id,
          payment.amount,
          slug,
          payment.currentTrackId ?? null,
        ];
        const result = user
          ? await paymentService.createPriorityPayment(...args)
          : await paymentService.createPriorityPaymentGuest(...args);
        setClientSecret(result.clientSecret);
        setPaymentIntentId(result.paymentIntentId);
      } catch {
        setInitError("Impossible d'initier le paiement. Veuillez réessayer.");
      } finally {
        setIsInitializing(false);
      }
    };

    initializePaymentIntent();
  }, [clientSecret, isInitializing, payment, slug]);

  if (!payment.isOpen || !payment.selectedTrack) {
    return null;
  }

  if (initError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-4 sm:px-4 sm:py-8">
        <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-dark p-4 sm:p-6 shadow-lg">
          <header className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white sm:text-lg flex-1 min-w-0 pr-2">
              Prioriser « <span className="truncate inline-block max-w-[200px] sm:max-w-none">{payment.selectedTrack.title}</span> »
            </h3>
            <button
              type="button"
              onClick={closePaymentModal}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/60 hover:text-white transition rounded-lg hover:bg-white/10"
              aria-label="Fermer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <p className="text-sm text-red-400">{initError}</p>
        </div>
      </div>
    );
  }

  if (!clientSecret || !paymentIntentId) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-4 sm:px-4 sm:pt-24">
        <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-dark p-4 sm:p-6 shadow-lg max-h-[90vh] overflow-y-auto">
          <header className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-white sm:text-lg">Préparation du paiement…</h3>
            <button
              type="button"
              onClick={closePaymentModal}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/60 hover:text-white transition rounded-lg hover:bg-white/10"
              aria-label="Fermer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <p className="text-sm text-white/70">Connexion sécurisée à Stripe en cours…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 py-4 sm:px-4 sm:pt-24">
      <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-dark p-4 sm:p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white sm:text-lg flex-1 min-w-0 pr-2">
            Prioriser « <span className="truncate inline-block max-w-[200px] sm:max-w-none">{payment.selectedTrack.title}</span> »
          </h3>
          <button
            type="button"
            onClick={closePaymentModal}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-white/60 hover:text-white transition rounded-lg hover:bg-white/10"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <Elements stripe={stripePromise} options={{ clientSecret, locale: 'fr-CA' }}>
          <PriorityPaymentForm
            slug={slug}
            paymentIntentId={paymentIntentId}
            mode={user ? 'authenticated' : 'guest'}
          />
        </Elements>
      </div>
    </div>
  );
};

