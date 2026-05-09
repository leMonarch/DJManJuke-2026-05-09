import { useState } from 'react';
import { Elements, useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';
import toast from 'react-hot-toast';
import { useJukebox } from '../context/JukeboxContext';
import { useAuth } from '../context/AuthContext';
import { getStripe } from '../services/stripeService';
import { paymentService } from '../services/paymentService';
import { apiClient } from '../services/apiClient';

type TrackPurchaseModalProps = {
  slug: string;
};

const stripePromise = getStripe();

type TrackPurchaseFormProps = {
  slug: string;
};

const TrackPurchaseForm = ({ slug: _slug }: TrackPurchaseFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const { trackPurchase, closeTrackPurchaseModal } = useJukebox();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!trackPurchase.selectedTrack) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || !trackPurchase.clientSecret || !trackPurchase.paymentIntentId) {
      return;
    }
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      // Même logique que pour la priorité : si Stripe renvoie
      // payment_intent_unexpected_state, cela signifie que le PaymentIntent
      // a déjà été confirmé avec succès. On ne bloque donc pas l'utilisateur
      // et on utilise l'ID de PaymentIntent déjà connu.
      if (stripeError) {
        const errorCode = (stripeError as any).code;
        if (errorCode !== 'payment_intent_unexpected_state') {
          setError(stripeError.message ?? 'Le paiement a échoué. Veuillez réessayer.');
          setIsSubmitting(false);
          return;
        }
      }

      const finalPaymentIntentId = paymentIntent?.id ?? trackPurchase.paymentIntentId;

      if (!finalPaymentIntentId) {
        setError('Le paiement ne peut pas être confirmé pour le moment.');
        setIsSubmitting(false);
        return;
      }

      if (user) {
        await paymentService.confirmTrackPurchase(finalPaymentIntentId);
      } else {
        await paymentService.confirmTrackPurchaseGuest(finalPaymentIntentId);
      }

      try {
        const selectedTrack = trackPurchase.selectedTrack;
        if (!selectedTrack) {
          setError('Aucune piste sélectionnée.');
          setIsSubmitting(false);
          return;
        }

        const response = await apiClient.post(
          '/songs/download-by-payment',
          {
            songId: selectedTrack.id,
            paymentIntentId: finalPaymentIntentId,
          },
          { responseType: 'blob' },
        );

        const contentType = (response.headers?.['content-type'] as string | undefined) ?? 'audio/mpeg';
        const blob: Blob =
          response.data instanceof Blob ? response.data : new Blob([response.data], { type: contentType });

        const originalPath = selectedTrack.file_path ?? '';
        const pathExt = originalPath.split('.').pop() || '';
        const inferredExt =
          pathExt ||
          (contentType.includes('wav')
            ? 'wav'
            : contentType.includes('mpeg') || contentType.includes('mp3')
            ? 'mp3'
            : 'bin');

        const safeTitle =
          (selectedTrack.title || 'track')
            .toString()
            .trim()
            .replace(/[^\w\-]+/g, '_') || 'track';

        const filename = `${safeTitle}.${inferredExt}`;

        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      } catch (downloadError: any) {
        // eslint-disable-next-line no-console
        console.error('Download failed', downloadError);
        const detail = downloadError?.response?.data?.message
          ? `Détail : ${downloadError.response.data.message}`
          : 'Réessaie plus tard ou contacte le support.';
        toast.error(`Le paiement a été confirmé, mais le téléchargement a échoué. ${detail}`);
      }

      closeTrackPurchaseModal();
      toast.success('Achat confirmé ! Le téléchargement a démarré. Merci pour votre soutien.');
    } catch (err) {
      const message = "Une erreur est survenue pendant le paiement. Veuillez réessayer.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-white/70">
        Vous êtes sur le point d'acheter « {trackPurchase.selectedTrack?.title ?? 'cette piste'} » pour{' '}
        <span className="font-semibold">1&nbsp;$</span>.
      </p>
      <div className="rounded-lg border border-white/20 bg-black/40 p-3">
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
          {isSubmitting ? 'Traitement…' : 'Payer 1 $'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={closeTrackPurchaseModal}
          className="min-h-[44px] flex-1 rounded-full border border-white/30 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
    </form>
  );
};

export const TrackPurchaseModal = ({ slug }: TrackPurchaseModalProps) => {
  const { trackPurchase } = useJukebox();

  if (!trackPurchase.isOpen || !trackPurchase.clientSecret) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-4 sm:pt-24">
      <div className="w-full max-w-[95vw] sm:max-w-md rounded-2xl bg-dark p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="mb-4">
          <h3 className="text-base font-semibold text-white sm:text-lg">Acheter ce titre</h3>
        </header>
        <Elements stripe={stripePromise} options={{ clientSecret: trackPurchase.clientSecret, locale: 'fr-CA' }}>
          <TrackPurchaseForm slug={slug} />
        </Elements>
      </div>
    </div>
  );
};


