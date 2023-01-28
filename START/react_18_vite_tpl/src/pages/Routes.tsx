import Cookies from 'js-cookie'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { HomePage } from '@/pages/Home.page'
import { NotFound } from '@/pages/Notfound.page'

declare global {
  interface Window {
    gtag?: (key: string, trackingId: string, config: { page_path: string }) => void
    ym?: (key: number, action: string, params: string) => void
  }
}

const ProtectedRoute = () => {
  const accessToken = Cookies.get('auth')
  const location = useLocation()

  // закрытые роутов
  if (!accessToken) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <Outlet />
}

const Router = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />

      {/* <Route path="/auth" element={<Authorization />}>
        <Route index element={<AuthorizationForm />} />
        <Route path="validation" element={<AuthorizationValidate />} />
        <Route path="*" element={<Navigate to="/auth" />} />
      </Route> */}
      <Route path="/" element={<ProtectedRoute />}>
        <Route index element={<HomePage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default Router
