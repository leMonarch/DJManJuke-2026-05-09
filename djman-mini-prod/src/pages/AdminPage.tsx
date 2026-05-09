import { useOutletContext } from 'react-router-dom';
import { AdminTabs } from '../components/AdminTabs';
import { useAuth } from '../context/AuthContext';
import type { LayoutContext } from './JukeboxLayout';

export const AdminPage = () => {
  const { slug } = useOutletContext<LayoutContext>();
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return <AdminTabs plan={user.plan} slug={slug} />;
};


