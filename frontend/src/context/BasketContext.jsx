// The quote basket: e-commerce "cart" for a B2B exporter. Items are SKUs with
// carton quantities; checking out submits an RFQ instead of taking payment.
import { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'ep_basket'
const BasketCtx = createContext(null)

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

export function BasketProvider({ children }) {
  const [items, setItems] = useState(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* ignore */ } }, [items])

  const add = (product, variant, qty) => setItems((cur) => {
    const i = cur.findIndex((x) => x.variant_id === variant.id)
    if (i >= 0) return cur.map((x, j) => (j === i ? { ...x, qty_cartons: x.qty_cartons + qty } : x))
    return [...cur, {
      variant_id: variant.id, sku: variant.sku, size_label: variant.size_label, product_name: product.name,
      product_slug: product.slug, category: product.category.slug, pcs_per_carton: variant.pcs_per_carton,
      moq_cartons: variant.moq_cartons, carton_cbm: variant.carton_cbm, list_price: variant.list_price,
      gross_weight_kg: variant.gross_weight_kg, qty_cartons: qty,
    }]
  })
  const update = (variant_id, qty) => setItems((cur) => cur.map((x) => (x.variant_id === variant_id ? { ...x, qty_cartons: Math.max(1, qty) } : x)))
  const remove = (variant_id) => setItems((cur) => cur.filter((x) => x.variant_id !== variant_id))
  const clear = () => setItems([])

  const totals = items.reduce((t, x) => ({
    cartons: t.cartons + x.qty_cartons,
    cbm: t.cbm + x.qty_cartons * (x.carton_cbm || 0),
    kg: t.kg + x.qty_cartons * (x.gross_weight_kg || 0),
  }), { cartons: 0, cbm: 0, kg: 0 })

  return <BasketCtx.Provider value={{ items, add, update, remove, clear, totals }}>{children}</BasketCtx.Provider>
}

export const useBasket = () => useContext(BasketCtx)

// Rough container fill: usable volume ~28 m³ in a 20GP, ~68 m³ in a 40HC.
export function containerFill(cbm) {
  return { twenty: Math.min(100, (cbm / 28) * 100), fortyHc: Math.min(100, (cbm / 68) * 100) }
}
