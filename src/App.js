import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './Frontend/Context/AuthContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';

// Layout Components
import PrivateRoute from './Frontend/Components/ProtectedRoute';
import MainLayout from './Frontend/Components/Layout/MainLayout';

// Pages
import Login from './Frontend/Pages/Auth/Login';
import Dashboard from './Frontend/Pages/Dashboard/Dashboard';
import CustomerList from './Frontend/Pages/Customers/CustomerList';
import CustomerForm from './Frontend/Pages/Customers/CustomerForm';
import CustomerDetails from './Frontend/Pages/Customers/CustomerDetails';
import PaymentCalculator from './Frontend/Pages/Payments/PaymentCalculator';
import PaymentSchedule from './Frontend/Pages/Payments/PaymentSchedule';
import InitiatePayment from './Frontend/Pages/Payments/InitiatePayment';
import PaymentHistory from './Frontend/Pages/Payments/PaymentHistory';
import GenerateMonthlyPayments from './Frontend/Pages/Payments/GenerateMonthlyPayments';
import PaymentView from './Frontend/Pages/Payments/PaymentView';
import EscalationTracker from './Frontend/Pages/Escalation/Escalation';
import TDSTracker from './Frontend/Pages/TDS/TDSTracker';
import TDSCertificates from './Frontend/Pages/TDS/TDSCertificate';
import MonthlySummary from './Frontend/Pages/TDS/MonthlySummary';
import ReceiptList from './Frontend/Pages/Receipts/ReceiptList';
import ReceiptView from './Frontend/Pages/Receipts/ReceiptView';
import Reports from './Frontend/Pages/Reports/Reports';
import Settings from './Frontend/Pages/Settings/Settings';
import FinancialManagement from './Frontend/Pages/FinanacialManagement/FinanacialManagement';

// Users  ← NEW
import UsersList from './Frontend/Users/UsersList';
import AddUsers from './Frontend/Users/AddUsers';
import Profile from './Frontend/Users/Profile';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastContainer position="top-center" autoClose={3000} />

        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            {/* Users — SUPERADMIN only (guard is inside AddUser component) */}
            {/* <Route path="users" element={<UsersList />} /> */}
            <Route
              path="users"
              element={
                <PrivateRoute roles={['SUPERADMIN']}>
                  <UsersList />
                </PrivateRoute>
              }
            />
            <Route
              path="users/new"
              element={
                <PrivateRoute roles={['SUPERADMIN']}>
                  <AddUsers />
                </PrivateRoute>
              }
            />

            {/* Customers */}
            <Route path="customers" element={<CustomerList />} />
            <Route path="customers/new" element={<CustomerForm />} />
            <Route path="customers/edit/:id" element={<CustomerForm />} />
            <Route path="customers/view/:id" element={<CustomerDetails />} />

            {/* Payments */}
            <Route
              path="/payments/calculator"
              element={
                <PrivateRoute>
                  <PaymentCalculator />
                </PrivateRoute>
              }
            />
            <Route
              path="/payments/schedule"
              element={
                <PrivateRoute>
                  <PaymentSchedule />
                </PrivateRoute>
              }
            />
            <Route
              path="/payments/generate"
              element={
                <PrivateRoute>
                  <GenerateMonthlyPayments />
                </PrivateRoute>
              }
            />
            <Route
              path="/payments/initiate"
              element={
                <PrivateRoute roles={['ADMIN', 'SUPERADMIN']}>
                  <InitiatePayment />
                </PrivateRoute>
              }
            />
            <Route
              path="/payments/history"
              element={
                <PrivateRoute>
                  <PaymentHistory />
                </PrivateRoute>
              }
            />

            <Route
              path="/payments/view/:id"
              element={
                <PrivateRoute>
                  <PaymentView />
                </PrivateRoute>
              }
            />

            {/* Financial & Escalation */}
            <Route path="financial"  element={<FinancialManagement />} />
            <Route path="escalation" element={<EscalationTracker />} />

            {/* TDS */}
            <Route path="tds/tracker"      element={<TDSTracker />} />
            <Route path="tds/certificates" element={<TDSCertificates />} />
            <Route path="tds/monthly"      element={<MonthlySummary />} />

            {/* Receipts */}
            <Route path="receipts"     element={<ReceiptList />} />
            <Route path="receipts/:id" element={<ReceiptView />} />

            {/* Reports & Settings */}
            <Route path="reports"  element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;