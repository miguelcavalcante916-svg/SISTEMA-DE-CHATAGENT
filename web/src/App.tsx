import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Alert, Spinner } from './components/ui';
import { CatalogPage } from './pages/CatalogPage';
import { ConversationsPage } from './pages/ConversationsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/LoginPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PrinterPage } from './pages/PrinterPage';
import { ReceiptPrintPage } from './pages/ReceiptPrintPage';
import { SettingsPage } from './pages/SettingsPage';
import { SetupPage } from './pages/SetupPage';
import { SimulatorPage } from './pages/SimulatorPage';
import { UsersPage } from './pages/UsersPage';
import { useAuth } from './state/auth';

function Gate({ children, admin = false }: { children: ReactElement; admin?: boolean }) {
  const { status, loading, error, user } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="auth-wrap">
        <Spinner />
      </div>
    );
  }
  if (error || !status) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <Alert kind="danger">Não foi possível falar com o servidor. Verifique se ele está em execução (npm run dev) e recarregue a página.</Alert>
        </div>
      </div>
    );
  }
  if (status.needsSetup) return <Navigate to="/configuracao-inicial" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && user.role !== 'admin') return <Alert kind="warning">Esta área é restrita a administradores.</Alert>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/configuracao-inicial" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/imprimir/:id"
        element={
          <Gate>
            <ReceiptPrintPage />
          </Gate>
        }
      />
      <Route
        element={
          <Gate>
            <Layout />
          </Gate>
        }
      >
        <Route path="/" element={<Navigate to="/pedidos" replace />} />
        <Route path="/pedidos" element={<OrdersPage />} />
        <Route path="/pedidos/novo" element={<NewOrderPage />} />
        <Route path="/pedidos/:id" element={<OrderDetailPage />} />
        <Route path="/pedidos/:id/editar" element={<NewOrderPage />} />
        <Route path="/conversas" element={<ConversationsPage />} />
        <Route path="/conversas/:id" element={<ConversationsPage />} />
        <Route path="/simulador" element={<SimulatorPage />} />
        <Route path="/catalogo" element={<CatalogPage />} />
        <Route path="/conhecimento" element={<KnowledgePage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="/impressora" element={<PrinterPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="*" element={<Alert kind="warning">Página não encontrada.</Alert>} />
      </Route>
    </Routes>
  );
}
