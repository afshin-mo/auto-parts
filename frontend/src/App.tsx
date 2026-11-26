import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { useAuth } from './lib/auth';

// هر صفحه یک chunk جدا؛ باندل اولیه فقط پوسته و ورود را دارد
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const Sales = lazy(() => import('./pages/Sales'));
const InvoiceForm = lazy(() => import('./pages/InvoiceForm'));
const InvoiceView = lazy(() => import('./pages/InvoiceView'));
const Parties = lazy(() => import('./pages/Parties'));
const PartyStatement = lazy(() => import('./pages/PartyStatement'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Duplicates = lazy(() => import('./pages/Duplicates'));
const Withdrawals = lazy(() => import('./pages/Withdrawals'));
const Checks = lazy(() => import('./pages/Checks'));
const Payments = lazy(() => import('./pages/Payments'));
const Reports = lazy(() => import('./pages/Reports'));
const Catalog = lazy(() => import('./pages/Catalog'));
const Settings = lazy(() => import('./pages/Settings'));
const Proformas = lazy(() => import('./pages/Proformas'));
const Returns = lazy(() => import('./pages/Returns'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Labels = lazy(() => import('./pages/Labels'));
const Lookup = lazy(() => import('./pages/Lookup'));
const QuickSale = lazy(() => import('./pages/QuickSale'));
const Debts = lazy(() => import('./pages/Debts'));
const ImportWizard = lazy(() => import('./pages/ImportWizard'));

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="lookup" element={<Lookup />} />
        <Route path="pos" element={<QuickSale />} />
        <Route path="debts" element={<Debts />} />
        <Route path="import" element={<ImportWizard />} />
        <Route path="sales" element={<Sales kind="sales" />} />
        <Route path="sales/new" element={<InvoiceForm kind="sales" />} />
        <Route path="sales/:id" element={<InvoiceView kind="sales" />} />
        <Route path="proformas" element={<Proformas />} />
        <Route path="proformas/new" element={<InvoiceForm kind="proformas" />} />
        <Route path="proformas/:id" element={<InvoiceView kind="proformas" />} />
        <Route path="returns" element={<Returns />} />
        <Route path="returns/:id" element={<InvoiceView kind="returns" />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="labels" element={<Labels />} />
        <Route path="purchases" element={<Sales kind="purchases" />} />
        <Route path="purchases/new" element={<InvoiceForm kind="purchases" />} />
        <Route path="purchases/:id" element={<InvoiceView kind="purchases" />} />
        <Route path="parties" element={<Parties />} />
        <Route path="parties/:id" element={<PartyStatement />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="duplicates" element={<Duplicates />} />
        <Route path="payments" element={<Payments />} />
        <Route path="checks" element={<Checks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
