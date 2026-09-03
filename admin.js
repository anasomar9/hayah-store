// ============================================================================
// HAYAH Admin Dashboard — auth, routing, CRUD for categories/products/orders
// ============================================================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = (n) => `${Number(n || 0).toLocaleString('ar-EG')} ج.م`;

let adminCategories = [];
let variantRowCount = 0;

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer;
function showToast(message) {
  const toast = $('#adminToast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function checkSession() {
  try {
    const {
      data: { session },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error('Session Error:', error);
      return;
    }

    if (session) {
      $('#loginScreen').hidden = true;
      $('#adminShell').hidden = false;
      $('#userEmail').textContent = session.user.email;
      router();
    } else {
      $('#loginScreen').hidden = false;
      $('#adminShell').hidden = true;
    }

  } catch (err) {
    console.error('Check Session Error:', err);
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
const loginForm = $('#loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailInput = $('#loginEmail');
    const passwordInput = $('#loginPassword');
    const errorEl = $('#loginError');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || '';

    errorEl.textContent = '';

    if (!email || !password) {
      errorEl.textContent =
        'من فضلك أدخل البريد الإلكتروني وكلمة المرور.';
      return;
    }

    try {
      // منع الضغط على زر الدخول أكثر من مرة
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'جاري تسجيل الدخول...';
      }

      console.log('Attempting login:', email);

      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        console.error('Supabase Login Error:', error);

        const message = (error.message || '').toLowerCase();

        if (message.includes('invalid login credentials')) {
          errorEl.textContent =
            'البريد الإلكتروني أو كلمة المرور غير صحيحة.';

        } else if (message.includes('email not confirmed')) {
          errorEl.textContent =
            'البريد الإلكتروني غير مؤكد. يرجى تأكيد البريد أولاً.';

        } else {
          errorEl.textContent =
            error.message || 'حدث خطأ أثناء تسجيل الدخول.';
        }

        return;
      }

      console.log('Login successful:', data);
      await checkSession();
      console.log('loginScreen:', $('#loginScreen'));
console.log('adminShell:', $('#adminShell'));
console.log('session:', data.session);
      // لا نستدعي checkSession() هنا.
      // onAuthStateChange الموجود في نهاية الملف
      // سيتولى تحديث الواجهة بعد نجاح تسجيل الدخول.

    } catch (err) {
      console.error('Unexpected Login Error:', err);

      errorEl.textContent =
        'حدث خطأ غير متوقع. افتح Console لمعرفة التفاصيل.';

    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent =
          submitBtn.dataset.originalText || 'تسجيل الدخول';
      }
    }
  });
}

$('#logoutBtn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  checkSession();
});

// ---------------------------------------------------------------------------
// Router (simple hash nav within admin shell)
// ---------------------------------------------------------------------------
const pages = ['dashboard', 'categories', 'products', 'orders', 'shipping'];
const pageTitles = {
  dashboard: 'نظرة عامة',
  categories: 'الفئات',
  products: 'المنتجات',
  orders: 'الطلبات',
  shipping: 'إدارة الشحن',
};

function router() {
  const hash = window.location.hash.replace('#/', '') || 'dashboard';
  const page = pages.includes(hash) ? hash : 'dashboard';

  pages.forEach((p) => { $(`#page-${p}`).hidden = p !== page; });
  $$('.admin-nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === page));
  $('#pageTitle').textContent = pageTitles[page];

  if (page === 'dashboard') loadDashboard();
  if (page === 'categories') loadCategoriesPage();
  if (page === 'products') loadProductsPage();
  if (page === 'orders') loadOrdersPage();
  if (page === 'shipping') loadShippingPage();
}
window.addEventListener('hashchange', router);

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------
function openModal(modalEl) {
  $$('.modal').forEach((m) => (m.hidden = true));
  modalEl.hidden = false;
  $('#modalOverlay').classList.add('is-open');
}
function closeModals() {
  $('#modalOverlay').classList.remove('is-open');
  $$('.modal').forEach((m) => (m.hidden = true));
}
$$('[data-close]').forEach((btn) => btn.addEventListener('click', closeModals));
$('#modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModals(); });

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
async function loadDashboard() {
  const [{ data: cats }, { data: prods }, { data: orders }] = await Promise.all([
    HayahDB.getAllCategoriesAdmin(),
    HayahDB.getAllProductsAdmin(),
    HayahDB.getAllOrdersAdmin(),
  ]);

  $('#statCategories').textContent = cats?.length ?? 0;
  $('#statProducts').textContent = prods?.length ?? 0;
  $('#statOrders').textContent = orders?.length ?? 0;
  $('#statPending').textContent = orders?.filter((o) => o.order_status === 'قيد المراجعة').length ?? 0;

  // Total Sales: sum of totals for confirmed/completed orders (excludes
  // orders still pending review and cancelled orders).
  const completedStatuses = ['مؤكد', 'جاري التجهيز', 'تم الشحن', 'خرج للتوصيل', 'تم التسليم'];
  const totalSales = (orders || [])
    .filter((o) => completedStatuses.includes(o.order_status))
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  $('#statTotalSales').textContent = money(totalSales);

  const recent = (orders || []).slice(0, 6);
  const table = $('#recentOrdersTable');
  if (recent.length === 0) {
    table.innerHTML = `<div class="empty-state"><i class="fa-solid fa-truck-fast"></i><h3>لا توجد طلبات بعد</h3></div>`;
    return;
  }
  table.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>رقم الطلب</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
      <tbody>
        ${recent.map((o) => `
          <tr>
            <td>${o.order_number}</td>
            <td>${o.customer_name}</td>
            <td>${money(o.total)}</td>
            <td><span class="badge badge--status">${o.order_status}</span></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------
async function loadCategoriesPage() {
  const { data, error } = await HayahDB.getAllCategoriesAdmin();
  adminCategories = error ? [] : (data || []);
  const tbody = $('#categoriesTable tbody');
  const empty = $('#categoriesEmpty');

  if (adminCategories.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = adminCategories.map((c) => `
    <tr>
      <td>${c.image_url ? `<img src="${c.image_url}" alt="" />` : '—'}</td>
      <td>${c.name_ar}</td>
      <td>${c.display_order}</td>
      <td><span class="badge badge--${c.status === 'active' ? 'active' : 'hidden'}">${c.status === 'active' ? 'مفعّلة' : 'مخفية'}</span></td>
      <td class="table-actions">
        <button class="icon-btn" data-edit-cat="${c.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" data-delete-cat="${c.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');

  $$('[data-edit-cat]', tbody).forEach((btn) => btn.addEventListener('click', () => editCategory(btn.dataset.editCat)));
  $$('[data-delete-cat]', tbody).forEach((btn) => btn.addEventListener('click', () => deleteCategory(btn.dataset.deleteCat)));
}

function resetCategoryForm() {
  $('#categoryForm').reset();
  $('#catId').value = '';
  $('#catOrder').value = 0;
  $('#categoryModalTitle').textContent = 'فئة جديدة';
}

$('#addCategoryBtn').addEventListener('click', () => { resetCategoryForm(); openModal($('#categoryModal')); });

function editCategory(id) {
  const cat = adminCategories.find((c) => c.id === id);
  if (!cat) return;
  $('#categoryModalTitle').textContent = 'تعديل الفئة';
  $('#catId').value = cat.id;
  $('#catName').value = cat.name_ar;
  $('#catSlug').value = cat.slug;
  $('#catDescription').value = cat.description || '';
  $('#catImage').value = cat.image_url || '';
  $('#catOrder').value = cat.display_order;
  $('#catStatus').value = cat.status;
  openModal($('#categoryModal'));
}

async function deleteCategory(id) {
  if (!confirm('هل تريدين حذف هذه الفئة؟ لن يتم حذف المنتجات المرتبطة بها.')) return;
  const { error } = await HayahDB.deleteCategory(id);
  if (error) return showToast('تعذر حذف الفئة');
  showToast('تم حذف الفئة');
  loadCategoriesPage();
}

$('#categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#catId').value;
  const payload = {
    name_ar: $('#catName').value.trim(),
    slug: $('#catSlug').value.trim().toLowerCase().replace(/\s+/g, '-'),
    description: $('#catDescription').value.trim() || null,
    image_url: $('#catImage').value.trim() || null,
    display_order: Number($('#catOrder').value) || 0,
    status: $('#catStatus').value,
  };
  const { error } = id ? await HayahDB.updateCategory(id, payload) : await HayahDB.createCategory(payload);
  if (error) return showToast('حدث خطأ: ' + error.message);
  showToast(id ? 'تم تحديث الفئة' : 'تم إضافة الفئة');
  closeModals();
  loadCategoriesPage();
});

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------
let adminProducts = [];
let productImageItems = []; // { id, url, file } — file is null for already-uploaded images
let productImageSeq = 0;
let removedExistingProductImages = [];

async function loadProductsPage() {
  if (adminCategories.length === 0) {
    const { data } = await HayahDB.getAllCategoriesAdmin();
    adminCategories = data || [];
  }
  $('#prodCategory').innerHTML = adminCategories.map((c) => `<option value="${c.id}">${c.name_ar}</option>`).join('')
    || `<option value="">لا توجد فئات — أضيفي فئة أولاً</option>`;

  const { data, error } = await HayahDB.getAllProductsAdmin();
  adminProducts = error ? [] : (data || []);
  const tbody = $('#productsTable tbody');
  const empty = $('#productsEmpty');

  if (adminProducts.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const statusLabel = { active: 'مفعّل', draft: 'مسودة', hidden: 'مخفي' };
  tbody.innerHTML = adminProducts.map((p) => `
    <tr>
      <td>${p.images?.[0] ? `<img src="${p.images[0]}" alt="" />` : '—'}</td>
      <td>${p.name_ar}</td>
      <td>${p.categories?.name_ar || '—'}</td>
      <td>${money(p.price)}</td>
      <td>${p.stock_quantity}</td>
      <td><span class="badge badge--${p.status}">${statusLabel[p.status]}</span></td>
      <td class="table-actions">
        <button class="icon-btn" data-edit-prod="${p.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" data-delete-prod="${p.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');

  $$('[data-edit-prod]', tbody).forEach((btn) => btn.addEventListener('click', () => editProduct(btn.dataset.editProd)));
  $$('[data-delete-prod]', tbody).forEach((btn) => btn.addEventListener('click', () => deleteProduct(btn.dataset.deleteProd)));
}

function resetProductForm() {
  $('#productForm').reset();
  $('#prodId').value = '';
  $('#variantsRows').innerHTML = '';
  variantRowCount = 0;
  productImageItems.forEach((it) => { if (it.file) URL.revokeObjectURL(it.url); });
  productImageItems = [];
  removedExistingProductImages = [];
  renderProductImagesPreview();
  $('#productModalTitle').textContent = 'منتج جديد';
}

function renderProductImagesPreview() {
  const wrap = $('#prodImagesPreview');
  wrap.innerHTML = productImageItems.map((item) => `
    <div class="image-preview-item">
      <img src="${item.url}" alt="" />
      <button type="button" class="image-preview-item__remove" data-remove-img="${item.id}"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `).join('');
  $$('[data-remove-img]', wrap).forEach((btn) => btn.addEventListener('click', () => removeProductImage(btn.dataset.removeImg)));
}

function removeProductImage(id) {
  const idx = productImageItems.findIndex((it) => String(it.id) === String(id));
  if (idx === -1) return;
  const [removed] = productImageItems.splice(idx, 1);
  if (removed.file) {
    URL.revokeObjectURL(removed.url); // it was just a local preview, never uploaded
  } else {
    removedExistingProductImages.push(removed.url); // cleaned up from storage after save
  }
  renderProductImagesPreview();
}

$('#prodImagesInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach((file) => {
    productImageItems.push({ id: ++productImageSeq, url: URL.createObjectURL(file), file });
  });
  e.target.value = ''; // allow selecting the same file(s) again later if needed
  renderProductImagesPreview();
});

function addVariantRow(variant = {}) {
  variantRowCount++;
  const rowId = `vrow-${variantRowCount}`;
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.id = rowId;
  row.dataset.variantId = variant.id || '';
  row.innerHTML = `
    <input type="text" placeholder="المقاس (مثال: M)" class="v-size" value="${variant.size || ''}" />
    <input type="text" placeholder="اللون" class="v-color" value="${variant.color || ''}" />
    <input type="text" placeholder="كود اللون (اختياري)" class="v-colorhex" value="${variant.color_hex || ''}" />
    <input type="number" placeholder="المخزون" class="v-stock" value="${variant.stock_quantity ?? 0}" />
    <button type="button" data-remove-row><i class="fa-solid fa-xmark"></i></button>
  `;
  row.querySelector('[data-remove-row]').addEventListener('click', () => row.remove());
  $('#variantsRows').appendChild(row);
}

$('#addVariantRow').addEventListener('click', () => addVariantRow());
$('#addProductBtn').addEventListener('click', () => {
  resetProductForm();
  if (adminCategories.length === 0) return showToast('أضيفي فئة أولاً قبل إضافة منتج');
  openModal($('#productModal'));
});

async function editProduct(id) {
  const p = adminProducts.find((x) => x.id === id);
  if (!p) return;
  $('#productModalTitle').textContent = 'تعديل المنتج';
  $('#prodId').value = p.id;
  $('#prodName').value = p.name_ar;

  $('#prodDescription').value = p.description_ar || '';
  $('#prodCategory').value = p.category_id || '';
  $('#prodPrice').value = p.price;
  $('#prodComparePrice').value = p.compare_at_price || '';
  $('#prodStock').value = p.stock_quantity;
  productImageItems.forEach((it) => { if (it.file) URL.revokeObjectURL(it.url); });
  productImageItems = (p.images || []).map((url) => ({ id: ++productImageSeq, url, file: null }));
  removedExistingProductImages = [];
  renderProductImagesPreview();
  $('#prodFeatured').checked = p.is_featured;
  $('#prodBestSeller').checked = p.is_best_seller;
  $('#prodNewArrival').checked = p.is_new_arrival;
  $('#prodStatus').value = p.status;

  $('#variantsRows').innerHTML = '';
  variantRowCount = 0;
  const { data: variants } = await HayahDB.getVariants(id);
  (variants || []).forEach((v) => addVariantRow(v));

  openModal($('#productModal'));
}

async function deleteProduct(id) {
  if (!confirm('هل تريدين حذف هذا المنتج نهائياً؟')) return;
  const product = adminProducts.find((p) => p.id === id);
  const { error } = await HayahDB.deleteProduct(id);
  if (error) return showToast('تعذر حذف المنتج');
  (product?.images || []).forEach((url) => HayahDB.deleteProductImageByUrl(url));
  showToast('تم حذف المنتج');
  loadProductsPage();
}

$('#productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#prodId').value;
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;

  // Upload any newly selected files (from the device gallery) to Supabase
  // Storage first. Existing already-uploaded images (file === null) are
  // left untouched.
  const filesToUpload = productImageItems.filter((it) => it.file);
  let uploadedCount = 0;
  if (filesToUpload.length) {
    submitBtn.disabled = true;
    submitBtn.textContent = `جاري رفع الصور… (0/${filesToUpload.length})`;
  }
  for (const item of productImageItems) {
    if (!item.file) continue;
    const { data: publicUrl, error: uploadError } = await HayahDB.uploadProductImage(item.file);
    if (uploadError) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
      return showToast('تعذر رفع إحدى الصور، حاولي مرة أخرى');
    }
    URL.revokeObjectURL(item.url);
    item.url = publicUrl;
    item.file = null;
    uploadedCount++;
    submitBtn.textContent = `جاري رفع الصور… (${uploadedCount}/${filesToUpload.length})`;
  }
  submitBtn.disabled = false;
  submitBtn.textContent = originalBtnText;

  const images = productImageItems.map((it) => it.url);

  const payload = {
    name_ar: $('#prodName').value.trim(),
    description_ar: $('#prodDescription').value.trim() || null,
    category_id: $('#prodCategory').value || null,
  
    price: Number($('#prodPrice').value),
    compare_at_price: $('#prodComparePrice').value ? Number($('#prodComparePrice').value) : null,
    stock_quantity: Number($('#prodStock').value) || 0,
    images,
    is_featured: $('#prodFeatured').checked,
    is_best_seller: $('#prodBestSeller').checked,
    is_new_arrival: $('#prodNewArrival').checked,
    status: $('#prodStatus').value,
  };

  const { data: savedProduct, error } = id
    ? await HayahDB.updateProduct(id, payload)
    : await HayahDB.createProduct(payload);

  if (error) return showToast('حدث خطأ: ' + error.message);

  // Clean up any images the admin removed during this edit
  removedExistingProductImages.forEach((url) => HayahDB.deleteProductImageByUrl(url));
  removedExistingProductImages = [];

  // Sync variants: simplest reliable approach — remove existing rows tied to
  // this product's saved ids, then re-insert current rows from the form.
  const productId = savedProduct.id;
  const existingVariantIds = $$('#variantsRows .variant-row')
    .map((r) => r.dataset.variantId)
    .filter(Boolean);

  if (id) {
    const { data: currentVariants } = await HayahDB.getVariants(id);
    const formVariantIds = existingVariantIds;
    const toDelete = (currentVariants || []).filter((v) => !formVariantIds.includes(v.id));
    for (const v of toDelete) await HayahDB.deleteVariant(v.id);
  }

  const rows = $$('#variantsRows .variant-row');
  for (const row of rows) {
    const size = row.querySelector('.v-size').value.trim();
    const color = row.querySelector('.v-color').value.trim();
    const colorHex = row.querySelector('.v-colorhex').value.trim();
    const stock = Number(row.querySelector('.v-stock').value) || 0;
    if (!size && !color) continue;

    const variantPayload = {
      product_id: productId,
      size: size || null,
      color: color || null,
      color_hex: colorHex || null,
      stock_quantity: stock,
    };
    if (row.dataset.variantId) {
      await HayahDB.updateVariant(row.dataset.variantId, variantPayload);
    } else {
      await HayahDB.createVariant(variantPayload);
    }
  }

  showToast(id ? 'تم تحديث المنتج' : 'تم إضافة المنتج');
  closeModals();
  loadProductsPage();
});

// ---------------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------------
let adminOrders = [];
const orderStatuses = ['قيد المراجعة', 'مؤكد', 'جاري التجهيز', 'تم الشحن', 'خرج للتوصيل', 'تم التسليم', 'ملغي'];
const paymentStatuses = ['قيد المراجعة', 'مؤكد', 'مرفوض'];

async function loadOrdersPage(status = '') {
  const { data, error } = await HayahDB.getAllOrdersAdmin({ status: status || null });
  adminOrders = error ? [] : (data || []);
  const tbody = $('#ordersTable tbody');
  const empty = $('#ordersEmpty');

  if (adminOrders.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const payBadge = { 'قيد المراجعة': 'pay-pending', 'مؤكد': 'pay-ok', 'مرفوض': 'pay-rejected' };
  tbody.innerHTML = adminOrders.map((o) => `
    <tr>
      <td>${o.order_number}</td>
      <td>${o.customer_name}<br><small>${o.customer_phone}</small></td>
      <td>${money(o.total)}</td>
      <td><span class="badge badge--${payBadge[o.payment_status]}">${o.payment_status}</span></td>
      <td><span class="badge badge--status">${o.order_status}</span></td>
      <td class="table-actions">
        <button class="icon-btn" data-view-order="${o.id}"><i class="fa-solid fa-eye"></i></button>
      </td>
    </tr>
  `).join('');

  $$('[data-view-order]', tbody).forEach((btn) => btn.addEventListener('click', () => viewOrder(btn.dataset.viewOrder)));
}

$('#orderStatusFilter').addEventListener('change', (e) => loadOrdersPage(e.target.value));

function viewOrder(id) {
  const o = adminOrders.find((x) => x.id === id);
  if (!o) return;

  $('#orderModalContent').innerHTML = `
    <div class="order-detail__row"><span>رقم الطلب</span><strong>${o.order_number}</strong></div>
    <div class="order-detail__row"><span>العميل</span><strong>${o.customer_name}</strong></div>
    <div class="order-detail__row"><span>الهاتف</span><strong>${o.customer_phone}</strong></div>
    <div class="order-detail__row"><span>العنوان</span><strong>${o.customer_city || ''} — ${o.shipping_address}</strong></div>
    <div class="order-detail__row"><span>طريقة الاستلام</span><strong>${o.delivery_method === 'pickup' ? 'استلام من المتجر' : 'توصيل لباب البيت'}</strong></div>
    ${o.governorate ? `<div class="order-detail__row"><span>المحافظة</span><strong>${o.governorate}</strong></div>` : ''}
    ${o.notes ? `<div class="order-detail__row"><span>ملاحظات</span><strong>${o.notes}</strong></div>` : ''}

    <div class="order-detail__section">
      <h4>المنتجات</h4>
      ${(o.order_items || []).map((it) => `
        <div class="order-detail__row"><span>${it.product_name}${it.variant_label ? ` (${it.variant_label})` : ''} × ${it.quantity}</span><strong>${money(it.line_total)}</strong></div>
      `).join('')}
      <div class="order-detail__row"><span>الشحن</span><strong>${money(o.shipping_fee)}</strong></div>
      <div class="order-detail__row"><span>الإجمالي</span><strong>${money(o.total)}</strong></div>
    </div>

    <div class="order-detail__section">
      <h4>الدفع</h4>
      <div class="order-detail__row"><span>الطريقة</span><strong>${o.payment_method === 'vodafone_cash' ? 'فودافون كاش' : 'إنستاباي'}</strong></div>
      <div class="order-detail__row"><span>رقم العملية</span><strong>${o.payment_reference || '—'}</strong></div>
    </div>

    <div class="status-update-form">
      <select id="updateOrderStatus">
        ${orderStatuses.map((s) => `<option value="${s}" ${s === o.order_status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <select id="updatePaymentStatus">
        ${paymentStatuses.map((s) => `<option value="${s}" ${s === o.payment_status ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <button class="btn btn--primary" id="saveOrderUpdate">حفظ التحديث</button>
    </div>
  `;

  $('#saveOrderUpdate').addEventListener('click', async () => {
    const order_status = $('#updateOrderStatus').value;
    const payment_status = $('#updatePaymentStatus').value;
    const { error } = await HayahDB.updateOrderStatus(o.id, { order_status, payment_status });
    if (error) return showToast('تعذر تحديث الطلب');
    showToast('تم تحديث حالة الطلب');
    closeModals();
    loadOrdersPage($('#orderStatusFilter').value);
  });

  openModal($('#orderModal'));
}

// ---------------------------------------------------------------------------
// SHIPPING MANAGEMENT (governorates -> shipping price)
// ---------------------------------------------------------------------------
let adminShippingZones = [];

async function loadShippingPage() {
  const { data, error } = await HayahDB.getShippingZones();
  adminShippingZones = error ? [] : (data || []);
  const tbody = $('#shippingTable tbody');
  const empty = $('#shippingEmpty');

  if (adminShippingZones.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = adminShippingZones.map((z) => `
    <tr>
      <td>${z.governorate}</td>
      <td>${money(z.shipping_price)}</td>
      <td class="table-actions">
        <button class="icon-btn" data-edit-ship="${z.id}"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" data-delete-ship="${z.id}"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');

  $$('[data-edit-ship]', tbody).forEach((btn) => btn.addEventListener('click', () => editShippingZone(btn.dataset.editShip)));
  $$('[data-delete-ship]', tbody).forEach((btn) => btn.addEventListener('click', () => deleteShippingZone(btn.dataset.deleteShip)));
}

function resetShippingForm() {
  $('#shippingForm').reset();
  $('#shipId').value = '';
  $('#shippingModalTitle').textContent = 'محافظة جديدة';
}

$('#addShippingZoneBtn').addEventListener('click', () => { resetShippingForm(); openModal($('#shippingModal')); });

function editShippingZone(id) {
  const zone = adminShippingZones.find((z) => z.id === id);
  if (!zone) return;
  $('#shippingModalTitle').textContent = 'تعديل سعر الشحن';
  $('#shipId').value = zone.id;
  $('#shipGovernorate').value = zone.governorate;
  $('#shipPrice').value = zone.shipping_price;
  openModal($('#shippingModal'));
}

async function deleteShippingZone(id) {
  if (!confirm('هل تريدين حذف هذه المحافظة من قائمة الشحن؟')) return;
  const { error } = await HayahDB.deleteShippingZone(id);
  if (error) return showToast('تعذر حذف المحافظة');
  showToast('تم حذف المحافظة');
  loadShippingPage();
}

$('#shippingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#shipId').value;
  const payload = {
    governorate: $('#shipGovernorate').value.trim(),
    shipping_price: Number($('#shipPrice').value) || 0,
  };
  const { error } = id
    ? await HayahDB.updateShippingZone(id, payload)
    : await HayahDB.createShippingZone(payload);
  if (error) return showToast('حدث خطأ: ' + error.message);
  showToast(id ? 'تم تحديث سعر الشحن' : 'تمت إضافة المحافظة');
  closeModals();
  loadShippingPage();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
checkSession();

supabaseClient.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);

  if (event === 'SIGNED_IN' && session) {
    $('#loginScreen').hidden = true;
    $('#adminShell').hidden = false;
    $('#userEmail').textContent = session.user.email;
    router();
  }

  if (event === 'SIGNED_OUT') {
    $('#loginScreen').hidden = false;
    $('#adminShell').hidden = true;
  }
});