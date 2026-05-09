import { Navigate, useParams } from 'react-router-dom';
import { NavigationTop } from '../components/NavigationTop';
import { PlaceJukebox } from '../components/PlaceJukebox';
import { PaymentModal } from '../components/PaymentModal';
import { TrackPurchaseModal } from '../components/TrackPurchaseModal';

export const JukeboxPage = () => {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-dark text-white">
      <NavigationTop slug={slug} />
      <main className="mx-auto max-w-6xl space-y-6 sm:space-y-8 px-4 py-6 sm:px-6 sm:py-10">
        <PlaceJukebox slug={slug} />
      </main>
      <PaymentModal slug={slug} />
      <TrackPurchaseModal slug={slug} />
    </div>
  );
};



