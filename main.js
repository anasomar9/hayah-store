// ============================================================================
// HAYAH Fashion Store — Storefront app logic
// Hash-based router + Supabase data rendering + cart + checkout + tracking.
// ============================================================================

const state = {
  categories: [],
  cart: JSON.parse(localStorage.getItem('hayah_cart') || '[]'),
  currentProduct: null,
  selectedVariant: null,
  qty: 1,
  shippingZones: [],
  shippingZonesLoaded: false,
};

const money = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

// ---------------------------------------------------------------------------
// Cart persistence & rendering
// ---------------------------------------------------------------------------
function saveCart() {
  localStorage.setItem('hayah_cart', JSON.stringify(state.cart));
  renderCart();
}

function addToCart(item) {
  const existing = state.cart.find((c) => c.variantId === item.variantId && c.productId === item.productId);
  if (existing) {
    existing.qty += item.qty;
  } else {
    state.cart.push(item);
  }
  saveCart();
  openCart();
  showToast('تمت الإضافة إلى السلة');
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  saveCart();
}

function updateCartQty(index, delta) {
  state.cart[index].qty += delta;
  if (state.cart[index].qty < 1) state.cart[index].qty = 1;
  saveCart();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function renderCart() {
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  $('#cartCount').textContent = count;

  const itemsEl = $('#cartItems');
  const emptyEl = $('#cartEmptyState');
  const footerEl = $('#cartFooter');

  if (state.cart.length === 0) {
    itemsEl.innerHTML = '';
    emptyEl.hidden = false;
    footerEl.style.display = 'none';
    return;
  }
  emptyEl.hidden = true;
  footerEl.style.display = 'block';

  itemsEl.innerHTML = state.cart.map((item, i) => `
    <div class="cart-item">
      <img src="${item.image || placeholderImg()}" alt="${item.name}" />
      <div class="cart-item__info">
        <div class="cart-item__name">${item.name}</div>
        ${item.variantLabel ? `<div class="cart-item__variant">${item.variantLabel}</div>` : ''}
        <div class="cart-item__row">
          <div class="cart-item__qty">
            <button data-qty="-1" data-index="${i}">−</button>
            <span>${item.qty}</span>
            <button data-qty="1" data-index="${i}">+</button>
          </div>
          <strong>${money(item.price * item.qty)}</strong>
        </div>
        <button class="cart-item__remove" data-remove="${i}">إزالة</button>
      </div>
    </div>
  `).join('');

  $('#cartTotal').textContent = money(cartTotal());

  $$('[data-qty]', itemsEl).forEach((btn) =>
    btn.addEventListener('click', () => updateCartQty(Number(btn.dataset.index), Number(btn.dataset.qty)))
  );
  $$('[data-remove]', itemsEl).forEach((btn) =>
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.remove)))
  );
}

function openCart() { $('#cartDrawer').classList.add('is-open'); $('#cartOverlay').classList.add('is-open'); }
function closeCart() { $('#cartDrawer').classList.remove('is-open'); $('#cartOverlay').classList.remove('is-open'); }

$('#cartToggle').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
$('#cartOverlay').addEventListener('click', closeCart);

function placeholderImg() {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#FBEEF2"/><text x="50%" y="50%" font-size="16" fill="#E28FA4" text-anchor="middle" dy=".3em">حياه</text></svg>`
  );
}

// ---------------------------------------------------------------------------
// Navigation chips (categories)
// ---------------------------------------------------------------------------
async function loadCategories() {
  const { data, error } = await HayahDB.getCategories();
  state.categories = error ? [] : (data || []);

  const navWrap = $('#navCategoriesInner');
  const gridWrap = $('#categoriesGrid');
  const shopList = $('#shopCategoryList');

  if (state.categories.length === 0) {
    navWrap.innerHTML = `<span class="nav-chip">لا توجد فئات متاحة حالياً</span>`;
    gridWrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-shapes"></i><h3>لا توجد فئات بعد</h3><p>هنضيف فئات المنتجات قريباً.</p></div>`;
    shopList.innerHTML = `<li><a href="#/shop" class="is-active">الكل</a></li>`;
    return;
  }

  navWrap.innerHTML = state.categories.map((c) =>
    `<a href="#/shop?category=${c.slug}" class="nav-chip" data-slug="${c.slug}">${c.name_ar}</a>`
  ).join('');

  gridWrap.innerHTML = state.categories.map((c) => `
    <a href="#/shop?category=${c.slug}" class="category-card">
      ${c.image_url
        ? `<div class="category-card__bg" style="background-image:url('${c.image_url}')"></div><div class="category-card__tint"></div>`
        : ''}
      <span class="category-card__label">${c.name_ar}</span>
    </a>
  `).join('');

  shopList.innerHTML = `<li><a href="#/shop">الكل</a></li>` + state.categories.map((c) =>
    `<li><a href="#/shop?category=${c.slug}">${c.name_ar}</a></li>`
  ).join('');
}

// ---------------------------------------------------------------------------
// Product card renderer
// ---------------------------------------------------------------------------
function productCardHTML(p) {
  const img = (p.images && p.images[0]) || placeholderImg();
  const badge = p.is_new_arrival ? 'جديد' : (p.compare_at_price ? 'عرض' : '');
  return `
    <div class="product-card">
      <a href="#/product/${p.slug}" class="product-card__img-wrap">
        <img src="${img}" alt="${p.name_ar}" loading="lazy" />
        ${badge ? `<span class="product-card__badge">${badge}</span>` : ''}
      </a>
      <div class="product-card__body">
        <span class="product-card__cat">${p.categories?.name_ar || ''}</span>
        <a href="#/product/${p.slug}"><h3 class="product-card__name">${p.name_ar}</h3></a>
        <div class="product-card__prices">
          <span class="product-card__price">${money(p.price)}</span>
          ${p.compare_at_price ? `<span class="product-card__compare">${money(p.compare_at_price)}</span>` : ''}
        </div>
      </div>
      <button class="product-card__add" data-quick-add="${p.id}" data-slug="${p.slug}">أضيفي للسلة</button>
    </div>
  `;
}

function bindQuickAdd(root) {
  $$('[data-quick-add]', root).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { data: product, error } = await HayahDB.getProductBySlug(btn.dataset.slug);
      if (error || !product) return showToast('تعذر إضافة المنتج');
      const variants = product.product_variants || [];
      if (variants.length > 0) {
        window.location.hash = `#/product/${product.slug}`;
        return showToast('اختاري المقاس واللون أولاً');
      }
      addToCart({
        productId: product.id,
        variantId: null,
        name: product.name_ar,
        price: product.price,
        image: product.images?.[0],
        variantLabel: '',
        qty: 1,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// HOME view data
// ---------------------------------------------------------------------------
async function loadHome() {
  const [{ data: featured }, { data: bestsellers }, { data: newArrivals }] = await Promise.all([
    HayahDB.getProducts({ featured: true, limit: 8 }),
    HayahDB.getProducts({ bestSeller: true, limit: 8 }),
    HayahDB.getProducts({ newArrival: true, limit: 8 }),
  ]);

  renderProductSection('#featuredGrid', '#section-featured', featured);
  renderProductSection('#bestsellerGrid', '#section-bestsellers', bestsellers);
  renderProductSection('#newArrivalsGrid', '#section-newarrivals', newArrivals);
}

function renderProductSection(gridSel, sectionSel, products) {
  const grid = $(gridSel);
  const section = $(sectionSel);
  if (!products || products.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  grid.innerHTML = products.map(productCardHTML).join('');
  bindQuickAdd(grid);
}

// ---------------------------------------------------------------------------
// SHOP view
// ---------------------------------------------------------------------------
async function loadShop(params) {
  const categorySlug = params.get('category');
  const filter = params.get('filter');
  const search = params.get('q');

  let categoryId = null;
  let title = 'كل المنتجات';
  if (categorySlug) {
    const cat = state.categories.find((c) => c.slug === categorySlug);
    if (cat) { categoryId = cat.id; title = cat.name_ar; }
  }
  if (filter === 'featured') title = 'مختارات حياه';
  if (filter === 'bestseller') title = 'الأكثر مبيعاً';
  if (filter === 'new') title = 'وصل حديثاً';
  if (filter === 'offers') title = 'العروض';
  if (search) title = `نتائج البحث عن "${search}"`;

  $('#shopTitle').textContent = title;

  $$('.nav-chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.slug === categorySlug));
  $$('#shopCategoryList a').forEach((a) => {
    const isAll = a.getAttribute('href') === '#/shop' && !categorySlug;
    const matches = categorySlug && a.getAttribute('href') === `#/shop?category=${categorySlug}`;
    a.classList.toggle('is-active', isAll || matches);
  });

  const { data, error } = await HayahDB.getProducts({
    categoryId,
    featured: filter === 'featured' || undefined,
    bestSeller: filter === 'bestseller' || undefined,
    newArrival: filter === 'new' || undefined,
    search: search || undefined,
    limit: 100,
  });

  let products = error ? [] : (data || []);
  if (filter === 'offers') products = products.filter((p) => p.compare_at_price);

  $('#shopCount').textContent = products.length ? `${products.length} منتج` : '';
  $('#shopGrid').innerHTML = products.map(productCardHTML).join('');
  $('#shopEmpty').hidden = products.length !== 0;
  bindQuickAdd($('#shopGrid'));
}

// ---------------------------------------------------------------------------
// PRODUCT DETAIL view
// ---------------------------------------------------------------------------
async function loadProductDetail(slug) {
  const { data: product, error } = await HayahDB.getProductBySlug(slug);
  const wrap = $('#productPageContent');

  if (error || !product) {
    wrap.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>المنتج غير موجود</h3><p>ربما تم إزالته أو تغيير رابطه.</p></div>`;
    return;
  }

  state.currentProduct = product;
  state.qty = 1;

  const variants = product.product_variants || [];
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
  const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
  state.selectedVariant = variants[0] || null;

  const images = product.images?.length ? product.images : [placeholderImg()];

  wrap.innerHTML = `
    <div class="product-detail">
      <div class="product-detail__gallery">
        <div class="product-detail__gallery-main"><img src="${images[0]}" id="mainImg" alt="${product.name_ar}" /></div>
        ${images.length > 1 ? `<div class="product-detail__thumbs">${images.map((img, i) =>
          `<img src="${img}" class="${i === 0 ? 'is-active' : ''}" data-thumb="${img}" />`).join('')}</div>` : ''}
      </div>
      <div class="product-detail__info">
        <span class="product-detail__cat">${product.categories?.name_ar || ''}</span>
        <h1 class="product-detail__name">${product.name_ar}</h1>
        <div class="product-detail__prices">
          <span class="product-detail__price" id="detailPrice">${money(product.price)}</span>
          ${product.compare_at_price ? `<span class="product-detail__compare">${money(product.compare_at_price)}</span>` : ''}
        </div>
        <p class="product-detail__desc">${product.description_ar || ''}</p>

        ${sizes.length ? `<div class="variant-group"><h4>المقاس</h4><div class="variant-options" id="sizeOptions">
          ${sizes.map((s) => `<button class="variant-chip" data-size="${s}">${s}</button>`).join('')}
        </div></div>` : ''}

        ${colors.length ? `<div class="variant-group"><h4>اللون</h4><div class="variant-options" id="colorOptions">
          ${colors.map((c) => `<button class="variant-chip" data-color="${c}">${c}</button>`).join('')}
        </div></div>` : ''}

        <div class="qty-row">
          <div class="qty-control">
            <button id="qtyMinus">−</button><span id="qtyVal">1</span><button id="qtyPlus">+</button>
          </div>
          <span class="stock-note" id="stockNote"></span>
        </div>

        <button class="btn btn--primary btn--full" id="addToCartBtn">أضيفي للسلة</button>
      </div>
    </div>
  `;

  $$('[data-thumb]', wrap).forEach((thumb) => thumb.addEventListener('click', () => {
    $('#mainImg').src = thumb.dataset.thumb;
    $$('[data-thumb]', wrap).forEach((t) => t.classList.remove('is-active'));
    thumb.classList.add('is-active');
  }));

  let selectedSize = sizes[0] || null;
  let selectedColor = colors[0] || null;

  function resolveVariant() {
    if (variants.length === 0) return null;
    return variants.find((v) =>
      (!sizes.length || v.size === selectedSize) && (!colors.length || v.color === selectedColor)
    ) || null;
  }

  function refreshVariantUI() {
    state.selectedVariant = resolveVariant();
    const stock = state.selectedVariant ? state.selectedVariant.stock_quantity : product.stock_quantity;
    const price = state.selectedVariant?.price_override ?? product.price;
    $('#detailPrice').textContent = money(price);
    const stockNote = $('#stockNote');
    if (stock <= 0) {
      stockNote.textContent = 'نفذت الكمية';
      stockNote.classList.add('low');
      $('#addToCartBtn').disabled = true;
    } else if (stock <= 5) {
      stockNote.textContent = `متبقي ${stock} فقط`;
      stockNote.classList.add('low');
      $('#addToCartBtn').disabled = false;
    } else {
      stockNote.textContent = 'متوفر';
      stockNote.classList.remove('low');
      $('#addToCartBtn').disabled = false;
    }
  }

  $$('[data-size]', wrap).forEach((btn, i) => {
    if (i === 0) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      selectedSize = btn.dataset.size;
      $$('[data-size]', wrap).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      refreshVariantUI();
    });
  });
  $$('[data-color]', wrap).forEach((btn, i) => {
    if (i === 0) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      selectedColor = btn.dataset.color;
      $$('[data-color]', wrap).forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      refreshVariantUI();
    });
  });

  $('#qtyMinus').addEventListener('click', () => { if (state.qty > 1) { state.qty--; $('#qtyVal').textContent = state.qty; } });
  $('#qtyPlus').addEventListener('click', () => { state.qty++; $('#qtyVal').textContent = state.qty; });

  $('#addToCartBtn').addEventListener('click', () => {
    const v = state.selectedVariant;
    const price = v?.price_override ?? product.price;
    const variantLabel = v ? [v.size, v.color].filter(Boolean).join(' / ') : '';
    addToCart({
      productId: product.id,
      variantId: v?.id || null,
      name: product.name_ar,
      price,
      image: images[0],
      variantLabel,
      qty: state.qty,
    });
  });

  if (variants.length > 0) refreshVariantUI();
}

// ---------------------------------------------------------------------------
// CHECKOUT view
// ---------------------------------------------------------------------------
// Shipping prices are never hardcoded here — they're loaded from the
// `shipping_zones` table in Supabase (managed from the admin "Shipping
// Management" screen). Home Pickup is always free.
async function loadShippingZones() {
  if (state.shippingZonesLoaded) return;
  const { data, error } = await HayahDB.getShippingZones();
  state.shippingZones = error ? [] : (data || []);
  state.shippingZonesLoaded = true;

  const select = $('#ckGovernorate');
  if (state.shippingZones.length === 0) {
    select.innerHTML = `<option value="">لا توجد محافظات متاحة حالياً</option>`;
  } else {
    select.innerHTML = state.shippingZones
      .map((z) => `<option value="${z.governorate}">${z.governorate} — ${money(z.shipping_price)}</option>`)
      .join('');
  }
}

function getSelectedDeliveryMethod() {
  const checked = $('input[name="deliveryMethod"]:checked');
  return checked ? checked.value : 'delivery';
}

function currentShippingFee() {
  if (state.cart.length === 0) return 0;
  if (getSelectedDeliveryMethod() === 'pickup') return 0;
  const governorateName = $('#ckGovernorate').value;
  const zone = state.shippingZones.find((z) => z.governorate === governorateName);
  return zone ? Number(zone.shipping_price) : 0;
}

function updateDeliveryMethodUI() {
  const isPickup = getSelectedDeliveryMethod() === 'pickup';
  const field = $('#governorateField');
  const select = $('#ckGovernorate');
  field.hidden = isPickup;
  select.required = !isPickup;
  renderCheckoutSummary();
}

$$('input[name="deliveryMethod"]').forEach((r) => r.addEventListener('change', updateDeliveryMethodUI));
$('#ckGovernorate').addEventListener('change', renderCheckoutSummary);

function renderCheckoutSummary() {
  $('#checkoutItems').innerHTML = state.cart.map((item) => `
    <div class="checkout-summary__item">
      <span>${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} × ${item.qty}</span>
      <span>${money(item.price * item.qty)}</span>
    </div>
  `).join('');
  const subtotal = cartTotal();
  const shipping = currentShippingFee();
  $('#ckSubtotal').textContent = money(subtotal);
  $('#ckShipping').textContent = money(shipping);
  $('#ckTotal').textContent = money(subtotal + shipping);
}

const paymentInstructionsMap = {
  vodafone_cash: 'حوّلي إجمالي المبلغ على رقم فودافون كاش: 01064934414 ثم اكتبي رقم العملية بالأسفل.',
  instapay: 'حوّلي إجمالي المبلغ عبر إنستاباي إلى: 01127580708 ثم اكتبي رقم العملية بالأسفل.',
};

function updatePaymentInstructions() {
  const method = $('input[name="paymentMethod"]:checked').value;
  $('#paymentInstructions').textContent = paymentInstructionsMap[method];
}

$$('input[name="paymentMethod"]').forEach((r) => r.addEventListener('change', updatePaymentInstructions));

$('#checkoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.cart.length === 0) return showToast('سلتك فاضية');

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري إرسال الطلب…';

  const subtotal = cartTotal();
  const deliveryMethod = getSelectedDeliveryMethod();
  const governorate = deliveryMethod === 'delivery' ? ($('#ckGovernorate').value || null) : null;
  const shipping = currentShippingFee();

  const orderPayload = {
    customer_name: $('#ckName').value.trim(),
    customer_phone: $('#ckPhone').value.trim(),
    customer_city: $('#ckCity').value.trim(),
    shipping_address: $('#ckAddress').value.trim(),
    notes: $('#ckNotes').value.trim() || null,
    subtotal,
    shipping_fee: shipping,
    total: subtotal + shipping,
    delivery_method: deliveryMethod,
    governorate,
    payment_method: $('input[name="paymentMethod"]:checked').value,
    payment_reference: $('#ckPaymentRef').value.trim(),
  };

  const items = state.cart.map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId,
    product_name: item.name,
    variant_label: item.variantLabel || null,
    unit_price: item.price,
    quantity: item.qty,
    line_total: item.price * item.qty,
  }));

  const { data: order, error } = await HayahDB.createOrder(orderPayload, items);

  submitBtn.disabled = false;
  submitBtn.textContent = 'تأكيد الطلب';

  if (error || !order) {
    console.error(error);
    return showToast('حدث خطأ أثناء إرسال الطلب، حاولي مرة أخرى');
  }

  state.cart = [];
  saveCart();
  $('#confirmOrderNumber').textContent = order.order_number;
  window.location.hash = '#/confirmation';
});

// ---------------------------------------------------------------------------
// TRACK ORDER view
// ---------------------------------------------------------------------------
const statusSteps = ['قيد المراجعة', 'مؤكد', 'جاري التجهيز', 'تم الشحن', 'خرج للتوصيل', 'تم التسليم'];

$('#trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const number = $('#trackOrderNumber').value.trim();
  const resultEl = $('#trackResult');
  resultEl.innerHTML = `<p>جاري البحث…</p>`;

  const { data: order, error } = await HayahDB.getOrderByNumber(number);
  if (error || !order) {
    resultEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>لم يتم العثور على الطلب</h3><p>تأكدي من رقم الطلب وحاولي مرة أخرى.</p></div>`;
    return;
  }

  const currentIndex = statusSteps.indexOf(order.order_status);
  const isCancelled = order.order_status === 'ملغي';

  resultEl.innerHTML = `
    <div class="order-tracking-result">
      <div class="order-status-badge">${order.order_status}</div>
      <p><strong>رقم الطلب:</strong> ${order.order_number}</p>
      <p><strong>الإجمالي:</strong> ${money(order.total)}</p>
      <p><strong>حالة الدفع:</strong> ${order.payment_status}</p>
      <div class="status-timeline">
        ${isCancelled
          ? `<div class="status-timeline__item"><div class="status-timeline__dot"></div><div class="status-timeline__text"><strong>تم إلغاء الطلب</strong></div></div>`
          : statusSteps.map((step, i) => `
            <div class="status-timeline__item" style="opacity:${i <= currentIndex ? 1 : .35}">
              <div class="status-timeline__dot"></div>
              <div class="status-timeline__text"><strong>${step}</strong></div>
            </div>
          `).join('')}
      </div>
    </div>
  `;
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function bindSearch(input) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      window.location.hash = `#/shop?q=${encodeURIComponent(input.value.trim())}`;
    }
  });
}
bindSearch($('#searchInput'));
bindSearch($('#searchInputMobile'));

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const views = {
  home: $('#view-home'),
  shop: $('#view-shop'),
  product: $('#view-product'),
  track: $('#view-track'),
  checkout: $('#view-checkout'),
  confirmation: $('#view-confirmation'),
};

function showView(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

async function router() {
  closeCart();
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = hash.split('?');
  const params = new URLSearchParams(queryStr || '');

  if (path === '/' || path === '') {
    showView('home');
    loadHome();
  } else if (path === '/shop') {
    showView('shop');
    loadShop(params);
  } else if (path.startsWith('/product/')) {
    showView('product');
    loadProductDetail(decodeURIComponent(path.split('/product/')[1]));
  } else if (path === '/track') {
    showView('track');
  } else if (path === '/checkout') {
    showView('checkout');
    await loadShippingZones();
    updateDeliveryMethodUI();
    updatePaymentInstructions();
  } else if (path === '/confirmation') {
    showView('confirmation');
  } else if (path === '/account') {
    showToast('صفحة الحساب قيد التطوير');
    window.location.hash = '#/';
  } else {
    showView('home');
    loadHome();
  }
}

window.addEventListener('hashchange', router);

// Mobile burger toggles category bar
$('#burgerBtn').addEventListener('click', () => {
  const bar = $('#navCategories');
  bar.style.display = bar.style.display === 'block' ? '' : 'block';
});

// ---------------------------------------------------------------------------
// CUSTOMER REVIEWS (static images bundled locally in /reviews — no backend)
// ---------------------------------------------------------------------------
// Images are expected at reviews/image-reviews1.jpeg, reviews/image-reviews2.jpeg, ...
// REVIEWS_IMAGE_COUNT is just an upper bound to probe for; any missing file
// numbers are silently skipped, so you can drop in fewer or more images
// (up to this count) without touching the code.
const REVIEWS_IMAGE_COUNT = 60;
let reviewsGridBuilt = false;

function buildReviewsGrid() {
  if (reviewsGridBuilt) return;
  reviewsGridBuilt = true;

  const grid = $('#reviewsGrid');
  const frag = document.createDocumentFragment();

  for (let i = 1; i <= REVIEWS_IMAGE_COUNT; i++) {
    const item = document.createElement('div');
    item.className = 'reviews-grid__item';

    const img = document.createElement('img');
    img.src = `reviews/image-reviews${i}.jpeg`;
    img.alt = `رأي عميلة رقم ${i}`;
    img.loading = 'lazy';
    img.addEventListener('error', () => item.remove()); // silently skip missing files
    img.addEventListener('click', () => openLightbox(img.src, img.alt));

    item.appendChild(img);
    frag.appendChild(item);
  }

  grid.appendChild(frag);

  // If every single probed image failed to load, show a friendly empty state
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (grid.children.length === 0) {
        grid.innerHTML = `<div class="reviews-empty"><i class="fa-solid fa-images"></i><p>هنضيف صور آراء العملاء قريباً.</p></div>`;
      }
    }, 400);
  });
}

function openReviewsModal() {
  buildReviewsGrid();
  $('#reviewsOverlay').classList.add('is-open');
  $('#reviewsModal').classList.add('is-open');
}
function closeReviewsModal() {
  $('#reviewsOverlay').classList.remove('is-open');
  $('#reviewsModal').classList.remove('is-open');
}

function openLightbox(src, alt) {
  const img = $('#lightboxImage');
  img.src = src;
  img.alt = alt || 'رأي عميلة';
  $('#lightboxOverlay').classList.add('is-open');
}
function closeLightbox() {
  $('#lightboxOverlay').classList.remove('is-open');
  $('#lightboxImage').src = '';
}

$('#reviewsOpenBtn').addEventListener('click', openReviewsModal);
$('#reviewsCloseBtn').addEventListener('click', closeReviewsModal);
$('#reviewsOverlay').addEventListener('click', closeReviewsModal);
$('#lightboxCloseBtn').addEventListener('click', closeLightbox);
$('#lightboxOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'lightboxOverlay') closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeLightbox();
  closeReviewsModal();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  renderCart();
  await loadCategories();
  await router();
})();