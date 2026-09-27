import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CompanyProvider, PortalLayout, PublicLayout } from './components/Layouts'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BasketProvider } from './context/BasketContext'
import { Login, Register } from './pages/public/Auth'
import Basket from './pages/public/Basket'
import Home from './pages/public/Home'
import { ProductDetail, Products } from './pages/public/Products'
import Track from './pages/public/Track'
import { Catalogue, Customers, Enquiries, ProductEditor, Profile, Users } from './pages/portal/Admin'
import Dashboard from './pages/portal/Dashboard'
import { InvoiceDetail, InvoiceList, PaymentList } from './pages/portal/Finance'
import { ShipmentDetail, ShipmentList } from './pages/portal/Logistics'
import { OrderDetail, OrderList } from './pages/portal/Orders'
import { QuoteDetail, QuoteEditor, QuoteList, RfqDetail, RfqList } from './pages/portal/Sales'

function StaffOnly({ children }) {
  const { isStaff } = useAuth()
  return isStaff ? children : <Navigate to="/portal" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <CompanyProvider>
        <AuthProvider>
          <BasketProvider>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="products" element={<Products />} />
                <Route path="products/:slug" element={<ProductDetail />} />
                <Route path="basket" element={<Basket />} />
                <Route path="track" element={<Track />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
              </Route>
              <Route path="portal" element={<PortalLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="rfqs" element={<RfqList />} />
                <Route path="rfqs/:id" element={<RfqDetail />} />
                <Route path="quotes" element={<QuoteList />} />
                <Route path="quotes/new" element={<StaffOnly><QuoteEditor /></StaffOnly>} />
                <Route path="quotes/:id" element={<QuoteDetail />} />
                <Route path="orders" element={<OrderList />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="shipments" element={<ShipmentList />} />
                <Route path="shipments/:id" element={<ShipmentDetail />} />
                <Route path="invoices" element={<InvoiceList />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route path="payments" element={<StaffOnly><PaymentList /></StaffOnly>} />
                <Route path="enquiries" element={<StaffOnly><Enquiries /></StaffOnly>} />
                <Route path="customers" element={<StaffOnly><Customers /></StaffOnly>} />
                <Route path="catalogue" element={<StaffOnly><Catalogue /></StaffOnly>} />
                <Route path="catalogue/:id" element={<StaffOnly><ProductEditor /></StaffOnly>} />
                <Route path="users" element={<StaffOnly><Users /></StaffOnly>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BasketProvider>
        </AuthProvider>
      </CompanyProvider>
    </BrowserRouter>
  )
}
