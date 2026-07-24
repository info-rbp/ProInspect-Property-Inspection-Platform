import React from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route, RouterProvider } from 'react-router-dom';
import AuthRedirect from './components/auth/AuthRedirect';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleProtectedRoute from './components/auth/RoleProtectedRoute';
import AppShell from './components/layout/AppShell';
import NotFound from './components/layout/NotFound';
import { AuthProvider } from './contexts/AuthContext';
import { ShellProvider } from './contexts/ShellContext';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const LoginRoutePage = React.lazy(() => import('./pages/LoginRoutePage'));
const AdminHomePage = React.lazy(() => import('./pages/admin/AdminHomePage'));
const InspectionJobDetailPage = React.lazy(() => import('./pages/admin/InspectionJobDetailPage'));
const InspectionJobsPage = React.lazy(() => import('./pages/admin/InspectionJobsPage'));
const PropertiesPage = React.lazy(() => import('./pages/admin/PropertiesPage'));
const PropertyDetailPage = React.lazy(() => import('./pages/admin/PropertyDetailPage'));
const ReportDetailPage = React.lazy(() => import('./pages/admin/ReportDetailPage'));
const ReportsPage = React.lazy(() => import('./pages/admin/ReportsPage'));
const SettingsPage = React.lazy(() => import('./pages/admin/SettingsPage'));
const TemplatesPage = React.lazy(() => import('./pages/admin/TemplatesPage'));
const UsersPage = React.lazy(() => import('./pages/admin/UsersPage'));
const ReportEditPage = React.lazy(() => import('./pages/reports/ReportEditPage'));
const ReportPreviewPage = React.lazy(() => import('./pages/reports/ReportPreviewPage'));
const WorkQueuePage = React.lazy(() => import('./features/work-queue/WorkQueuePage').then((module) => ({ default: module.WorkQueuePage })));
const ReviewWorkspacePage = React.lazy(() => import('./features/review/ReviewWorkspacePage').then((module) => ({ default: module.ReviewWorkspacePage })));
const ServiceOperationsPage = React.lazy(() => import('./features/operations/ServiceOperationsPage').then((module) => ({ default: module.ServiceOperationsPage })));

const router = createBrowserRouter(createRoutesFromElements(
  <>
    <Route path="/" element={<AuthRedirect />} />
    <Route path="/auth/login" element={<LoginRoutePage />} />

    <Route path="/app" element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route element={<RoleProtectedRoute section="dashboard" />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="admin" element={<AdminHomePage />} />
        </Route>
        <Route element={<RoleProtectedRoute section="properties" />}>
          <Route path="admin/properties" element={<PropertiesPage />} />
          <Route path="admin/properties/:propertyId" element={<PropertyDetailPage />} />
        </Route>
        <Route element={<RoleProtectedRoute section="jobs" />}>
          <Route path="admin/jobs" element={<InspectionJobsPage />} />
          <Route path="admin/jobs/:jobId" element={<InspectionJobDetailPage />} />
          <Route path="admin/work-queue" element={<WorkQueuePage />} />
        </Route>
        <Route element={<RoleProtectedRoute section="reports" />}>
          <Route path="admin/reports" element={<ReportsPage />} />
          <Route path="admin/reports/:reportId" element={<ReportDetailPage />} />
          <Route path="admin/reports/:reportId/edit" element={<ReportEditPage />} />
          <Route path="admin/reports/:reportId/preview" element={<ReportPreviewPage />} />
          <Route path="admin/reports/:reportId/review" element={<ReviewWorkspacePage />} />
        </Route>
        <Route element={<RoleProtectedRoute section="operations" />}><Route path="admin/operations" element={<ServiceOperationsPage />} /></Route>
        <Route element={<RoleProtectedRoute section="users" />}><Route path="admin/users" element={<UsersPage />} /></Route>
        <Route element={<RoleProtectedRoute section="templates" />}><Route path="admin/templates" element={<TemplatesPage />} /></Route>
        <Route element={<RoleProtectedRoute section="settings" />}><Route path="admin/settings" element={<SettingsPage />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </>,
));

const App: React.FC = () => (
  <AuthProvider>
    <ShellProvider>
      <React.Suspense fallback={<div role="status" className="grid min-h-screen place-items-center bg-ink-50 text-sm font-bold text-ink-600">Loading ProInspect…</div>}>
        <RouterProvider router={router} />
      </React.Suspense>
    </ShellProvider>
  </AuthProvider>
);

export default App;
