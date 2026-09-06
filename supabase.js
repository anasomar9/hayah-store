// ============================================================================
// HAYAH Fashion Store — Supabase client & data-access layer
// Shared by index (storefront) and admin (dashboard).
// Loaded as a plain <script> tag AFTER the Supabase CDN script.
// ============================================================================

// ---- 1. Configure your project here -----------------------------------
const SUPABASE_URL = 'https://ifwvqlvklukcfxryhrtq.supabase.co'; // e.g. https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_9s_m-otLLsXALcvkIu7vvA_JMdoPt4m';

// ---- 2. Client instance --------------------------------------------------
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- 3. Data-access helpers ------------------------------------------------
// Every function returns { data, error } so callers can handle failures
// gracefully and show empty/error states instead of crashing.

const HayahDB = {
  // ---------------- Categories ----------------
  async getCategories({ onlyActive = true } = {}) {
    let query = supabaseClient.from('categories').select('*').order('display_order', { ascending: true });
    if (onlyActive) query = query.eq('status', 'active');
    return query;
  },

  async getAllCategoriesAdmin() {
    return supabaseClient.from('categories').select('*').order('display_order', { ascending: true });
  },

  async createCategory(payload) {
    return supabaseClient.from('categories').insert(payload).select().single();
  },

  async updateCategory(id, payload) {
    return supabaseClient.from('categories').update(payload).eq('id', id).select().single();
  },

  async deleteCategory(id) {
    return supabaseClient.from('categories').delete().eq('id', id);
  },

  // ---------------- Products ----------------
  async getProducts({ categoryId = null, featured, bestSeller, newArrival, search, limit = 60 } = {}) {
    let query = supabaseClient.from('products').select('*, categories(name_ar, slug)').eq('status', 'active');
    if (categoryId) query = query.eq('category_id', categoryId);
    if (featured) query = query.eq('is_featured', true);
    if (bestSeller) query = query.eq('is_best_seller', true);
    if (newArrival) query = query.eq('is_new_arrival', true);
    if (search) query = query.ilike('name_ar', `%${search}%`);
    return query.order('created_at', { ascending: false }).limit(limit);
  },

  async getProductBySlug(slug) {
    return supabaseClient
      .from('products')
      .select('*, categories(name_ar, slug), product_variants(*)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();
  },

  async getAllProductsAdmin() {
    return supabaseClient
      .from('products')
      .select('*, categories(name_ar)')
      .order('created_at', { ascending: false });
  },

  async createProduct(payload) {
    return supabaseClient.from('products').insert(payload).select().single();
  },

  async updateProduct(id, payload) {
    return supabaseClient.from('products').update(payload).eq('id', id).select().single();
  },

  async deleteProduct(id) {
    return supabaseClient.from('products').delete().eq('id', id);
  },

  // ---------------- Variants ----------------
  async getVariants(productId) {
    return supabaseClient.from('product_variants').select('*').eq('product_id', productId);
  },

  async createVariant(payload) {
    return supabaseClient.from('product_variants').insert(payload).select().single();
  },

  async updateVariant(id, payload) {
    return supabaseClient.from('product_variants').update(payload).eq('id', id).select().single();
  },

  async deleteVariant(id) {
    return supabaseClient.from('product_variants').delete().eq('id', id);
  },

  // ---------------- Shipping Zones (governorate -> shipping price) ----------------
  // Public-read (checkout needs it with no auth); admin manages CRUD.
  async getShippingZones() {
    return supabaseClient.from('shipping_zones').select('*').order('governorate', { ascending: true });
  },

  async createShippingZone(payload) {
    return supabaseClient.from('shipping_zones').insert(payload).select().single();
  },

  async updateShippingZone(id, payload) {
    return supabaseClient.from('shipping_zones').update(payload).eq('id', id).select().single();
  },

  async deleteShippingZone(id) {
    return supabaseClient.from('shipping_zones').delete().eq('id', id);
  },

  // ---------------- Storage (product image uploads) ----------------
  // Uploads a File chosen from the device gallery straight to Supabase
  // Storage. The stored filename is always a freshly generated random id +
  // a sanitized extension — never the original filename — so Arabic names,
  // spaces, or WhatsApp-style names (IMG-2024...) never cause any issues.
  async uploadProductImage(file) {
    const fromName = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const mimeMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };
    const ext = (fromName && fromName.length <= 5) ? fromName : (mimeMap[file.type] || 'jpg');
    const randomId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${randomId}.${ext}`;

    const { error } = await supabaseClient.storage
      .from('product-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) return { data: null, error };

    const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
    return { data: data.publicUrl, error: null };
  },

  // Best-effort cleanup when an image is removed/replaced or a product is deleted.
  async deleteProductImageByUrl(url) {
    const marker = '/product-images/';
    const idx = (url || '').indexOf(marker);
    if (idx === -1) return { error: null };
    const path = decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
    return supabaseClient.storage.from('product-images').remove([path]);
  },

  // ---------------- Customers ----------------
  async createCustomer(payload) {
    return supabaseClient.from('customers').insert(payload).select().single();
  },

  // ---------------- Orders ----------------
  async createOrder(orderPayload, items) {
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();
    if (orderError) return { data: null, error: orderError };

    const itemsWithOrderId = items.map((it) => ({ ...it, order_id: order.id }));
    const { error: itemsError } = await supabaseClient.from('order_items').insert(itemsWithOrderId);
    if (itemsError) return { data: null, error: itemsError };

    return { data: order, error: null };
  },

  async getOrderByNumber(orderNumber) {
    return supabaseClient
      .from('orders')
      .select('*, order_items(*), order_status_history(*)')
      .eq('order_number', orderNumber.trim())
      .single();
  },

  async getAllOrdersAdmin({ status = null } = {}) {
    let query = supabaseClient.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    if (status) query = query.eq('order_status', status);
    return query;
  },

  async updateOrderStatus(id, fields) {
    return supabaseClient.from('orders').update(fields).eq('id', id).select().single();
  },

  // ---------------- Realtime sync (admin edits reflect instantly on storefront) ----------------
  subscribeToTable(table, callback) {
    return supabaseClient
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  },
};

// Expose globally for main.js / admin.js
window.HayahDB = HayahDB;
window.supabaseClient = supabaseClient;
