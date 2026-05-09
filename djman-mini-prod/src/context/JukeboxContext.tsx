import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Track } from '../types/music';

type PaymentState = {
  isOpen: boolean;
  selectedTrack: Track | null;
  amount: number;
  currentTrackId: number | null;
};

type TrackPurchaseState = {
  isOpen: boolean;
  selectedTrack: Track | null;
  clientSecret: string | null;
  paymentIntentId: string | null;
};

type JukeboxContextValue = {
  payment: PaymentState;
  trackPurchase: TrackPurchaseState;
  openPaymentModal: (track: Track, currentTrackId?: number | null, amountOverride?: number | null) => void;
  closePaymentModal: () => void;
  openTrackPurchaseModal: (track: Track, clientSecret: string, paymentIntentId: string) => void;
  closeTrackPurchaseModal: () => void;
};

const JukeboxContext = createContext<JukeboxContextValue | undefined>(undefined);

const PRIORITY_MIN_PRICE = 0.5;
const PRIORITY_INCREMENT = 0.25;

const snapToIncrement = (value: number) =>
  Math.round(value / PRIORITY_INCREMENT) * PRIORITY_INCREMENT;

export const JukeboxProvider = ({ children }: PropsWithChildren) => {
  const [payment, setPayment] = useState<PaymentState>({
    isOpen: false,
    selectedTrack: null,
    amount: PRIORITY_MIN_PRICE,
    currentTrackId: null,
  });

  const [trackPurchase, setTrackPurchase] = useState<TrackPurchaseState>({
    isOpen: false,
    selectedTrack: null,
    clientSecret: null,
    paymentIntentId: null,
  });

  const openPaymentModal = useCallback(
    (track: Track, currentTrackId?: number | null, amountOverride?: number | null) => {
      const baseWeight = Number(track.priority_weight ?? 0);
      const computedAmount = baseWeight > 0 ? baseWeight + PRIORITY_INCREMENT : PRIORITY_MIN_PRICE;
      const normalizedAmount = amountOverride ?? computedAmount;
      const snappedAmount = snapToIncrement(normalizedAmount);
      const clampedAmount = Math.max(snappedAmount, PRIORITY_MIN_PRICE);
      const finalAmount = Number(clampedAmount.toFixed(2));
      setPayment({
        isOpen: true,
        selectedTrack: track,
        amount: finalAmount,
        currentTrackId: currentTrackId ?? null,
      });
    },
    [],
  );

  const closePaymentModal = useCallback(() => {
    setPayment({
      isOpen: false,
      selectedTrack: null,
      amount: PRIORITY_MIN_PRICE,
      currentTrackId: null,
    });
  }, []);

  const openTrackPurchaseModal = useCallback(
    (track: Track, clientSecret: string, paymentIntentId: string) => {
      setTrackPurchase({
        isOpen: true,
        selectedTrack: track,
        clientSecret,
        paymentIntentId,
      });
    },
    [],
  );

  const closeTrackPurchaseModal = useCallback(() => {
    setTrackPurchase({
      isOpen: false,
      selectedTrack: null,
      clientSecret: null,
      paymentIntentId: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      payment,
      trackPurchase,
      openPaymentModal,
      closePaymentModal,
      openTrackPurchaseModal,
      closeTrackPurchaseModal,
    }),
    [closePaymentModal, closeTrackPurchaseModal, openPaymentModal, openTrackPurchaseModal, payment, trackPurchase],
  );

  return <JukeboxContext.Provider value={value}>{children}</JukeboxContext.Provider>;
};

export const useJukebox = () => {
  const context = useContext(JukeboxContext);
  if (!context) {
    throw new Error('useJukebox must be used within a JukeboxProvider');
  }
  return context;
};


