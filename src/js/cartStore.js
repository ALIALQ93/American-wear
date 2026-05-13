const CART_KEY = "aw_storefront_cart_v1";

/** @typedef {{ variantId: number, productId: number, nameAr: string, imageUrl: string|null, priceIqd: number, qty: number, variantLabel: string }} CartLine */

/** @returns {CartLine[]} */
export function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => ({
        variantId: Number(row.variantId),
        productId: Number(row.productId),
        nameAr: String(row.nameAr || ""),
        imageUrl: row.imageUrl != null ? String(row.imageUrl) : null,
        priceIqd: Number(row.priceIqd) || 0,
        qty: Math.max(1, Math.floor(Number(row.qty) || 1)),
        variantLabel: String(row.variantLabel || ""),
      }))
      .filter((row) => Number.isFinite(row.variantId) && row.variantId > 0 && row.nameAr);
  } catch {
    return [];
  }
}

/** @param {CartLine[]} lines */
function writeCart(lines) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
  window.dispatchEvent(new CustomEvent("aw-cart-updated"));
}

export function cartCount() {
  return readCart().reduce((sum, line) => sum + line.qty, 0);
}

export function cartSubtotalIqd() {
  return readCart().reduce((sum, line) => sum + line.priceIqd * line.qty, 0);
}

/** @param {Omit<CartLine, 'qty'> & { qty?: number }} item */
export function addToCart(item) {
  const qty = Math.max(1, Math.floor(Number(item.qty) || 1));
  const lines = readCart();
  const idx = lines.findIndex((l) => l.variantId === item.variantId);
  if (idx >= 0) {
    lines[idx] = { ...lines[idx], qty: lines[idx].qty + qty };
  } else {
    lines.push({
      variantId: item.variantId,
      productId: item.productId,
      nameAr: item.nameAr,
      imageUrl: item.imageUrl ?? null,
      priceIqd: item.priceIqd,
      qty,
      variantLabel: item.variantLabel || "",
    });
  }
  writeCart(lines);
}

export function setCartLineQty(variantId, qty) {
  const vid = Number(variantId);
  const q = Math.floor(Number(qty) || 0);
  const lines = readCart().filter((l) => l.variantId !== vid);
  if (q > 0) {
    const prev = readCart().find((l) => l.variantId === vid);
    if (prev) lines.push({ ...prev, qty: q });
  }
  writeCart(lines);
}

export function removeFromCart(variantId) {
  writeCart(readCart().filter((l) => l.variantId !== Number(variantId)));
}

export function clearCart() {
  writeCart([]);
}
