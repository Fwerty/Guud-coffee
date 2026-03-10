// index.js - Guud Coffee QR Menü Uygulaması
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();

// Port Railway otomatik atıyor, yoksa 3000 kullan
const PORT = process.env.PORT || 3000;

// ============ VERİ YOLU (Railway Persistent Volume veya yerel ./data) ============
const dataPath =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const productsPath = path.join(dataPath, "products.json");
const settingsPath = path.join(dataPath, "settings.json");
const imagesDir = path.join(dataPath, "images");

function ensureDataDirs() {
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
}

const defaultProducts = [
  { id: 1, name: "Espresso", price: 35, image: "" },
  { id: 2, name: "Americano", price: 40, image: "" },
  { id: 3, name: "Latte", price: 50, image: "" },
  { id: 4, name: "Cappuccino", price: 50, image: "" },
  { id: 5, name: "Mocha", price: 55, image: "" },
  { id: 6, name: "Sütlü Kahve", price: 45, image: "" },
  { id: 7, name: "Türk Kahvesi", price: 40, image: "" },
  { id: 8, name: "Çay", price: 25, image: "" },
  { id: 9, name: "Çikolatalı Cookie", price: 45, image: "" },
  { id: 10, name: "Cheesecake Dilim", price: 55, image: "" },
];

function readProducts() {
  ensureDataDirs();
  if (!fs.existsSync(productsPath)) {
    fs.writeFileSync(
      productsPath,
      JSON.stringify(defaultProducts, null, 2),
      "utf8",
    );
    return defaultProducts;
  }
  const raw = fs.readFileSync(productsPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    return defaultProducts;
  }
}

function writeProducts(products) {
  ensureDataDirs();
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), "utf8");
}

function nextProductId(products) {
  const ids = products.map((p) => p.id).filter((n) => Number.isInteger(n));
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readSettings() {
  ensureDataDirs();
  if (!fs.existsSync(settingsPath)) {
    const def = { tables: 5 };
    fs.writeFileSync(settingsPath, JSON.stringify(def, null, 2), "utf8");
    return def;
  }
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    const s = JSON.parse(raw);
    return { tables: Math.max(1, Math.min(50, parseInt(s.tables, 10) || 5)) };
  } catch {
    return { tables: 5 };
  }
}

function writeSettings(settings) {
  ensureDataDirs();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
}

// Multer: fotoğraflar data/images içine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDataDirs();
    cb(null, imagesDir);
  },
  filename: (req, file, cb) => {
    const ext =
      (file.originalname && path.extname(file.originalname)) || ".jpg";
    cb(
      null,
      "img-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ext,
    );
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Yüklenen fotoğrafları servis et (JSON'da images/xxx.jpg gibi yol tutulacak)
app.get("/uploads/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename) return res.status(400).end();
  const filePath = path.join(imagesDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ============ ADMIN BASIC AUTH (Railway: ADMIN_USER, ADMIN_PASS) ============
const adminAuth = (req, res, next) => {
  try {
    const user = process.env.ADMIN_USER || "";
    const pass = process.env.ADMIN_PASS || "";
    if (!user.trim() || !pass) {
      console.error(
        "Panel auth failed: ADMIN_USER veya ADMIN_PASS Railway Variables'da tanımlı değil.",
      );
      return res
        .status(500)
        .send(
          "Admin kimlik bilgileri tanımlı değil. Railway Dashboard > Variables > ADMIN_USER ve ADMIN_PASS ekleyin.",
        );
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Guud Coffee Panel"');
      return res.status(401).send("Yetkisiz erişim.");
    }
    const b64 = auth.slice(6).trim();
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    const u = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
    const p = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
    if (u !== user || p !== pass) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Guud Coffee Panel"');
      return res.status(401).send("Kullanıcı adı veya şifre hatalı.");
    }
    next();
  } catch (err) {
    console.error("Panel auth error:", err);
    return res.status(500).send("Sunucu hatası. Railway loglarına bakın.");
  }
};

// ============ SİPARİŞ DEPOLAMA (şimdilik bellek içinde) ============
const orders = [];
let orderIdCounter = 1;

// ============ ANA SAYFA ============
app.get("/", (req, res) => {
  const { tables } = readSettings();
  const links = Array.from({ length: tables }, (_, i) => i + 1)
    .map((n) => `<a href="/menu/${n}">Masa ${n}</a>`)
    .join(" | ");
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Guud Coffee</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:50px;background:#2d2d2d;color:#fff;">
      <h1>☕ Guud Coffee</h1>
      <p>QR menü ve sipariş sistemi</p>
      <p><a href="/panel" style="color:#f0a;text-decoration:none;">📋 Sipariş Paneli</a></p>
      <hr style="border-color:#444;margin:20px 0">
      <p><strong>Masa menüleri (QR için URL'ler):</strong></p>
      <p>${links}</p>
      <p style="font-size:0.9em;color:#888">QR kod oluşturmak için bu URL'leri <a href="https://www.qr-code-generator.com/" target="_blank" style="color:#c9a227">qr-code-generator.com</a> gibi sitelere yapıştırabilirsiniz.</p>
    </body>
    </html>
  `);
});

// ============ MENÜ SAYFASI (QR ile açılacak: /menu/1, /menu/2, ...) ============
app.get("/menu/:tableId", (req, res) => {
  const { tables } = readSettings();
  const tableId = parseInt(req.params.tableId, 10);
  if (isNaN(tableId) || tableId < 1 || tableId > tables) {
    return res.status(404).send(`Geçersiz masa numarası. 1-${tables} arası olmalı.`);
  }

  const menu = readProducts();
  const menuItemsHtml = menu
    .map((item) => {
      const img = item.image
        ? '<img class="menu-item-img" src="/uploads/' + item.image + '" alt="">'
        : "";
      return `
      <div class="menu-item" data-id="${item.id}" data-name="${escapeHtml(item.name)}" data-price="${item.price}">
        ${img}
        <span class="name">${escapeHtml(item.name)}</span>
        <span class="price">${item.price} ₺</span>
        <button class="add-btn">+</button>
      </div>
    `;
    })
    .join("");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Guud Coffee - Masa ${tableId}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #1a1a1a; color: #fff; min-height: 100vh; }
        h1 { text-align: center; color: #c9a227; }
        .table-badge { text-align: center; color: #888; margin-bottom: 20px; }
        .menu-list { max-width: 400px; margin: 0 auto; }
        .menu-item { display: flex; align-items: center; justify-content: space-between; 
          padding: 16px; background: #2a2a2a; margin-bottom: 8px; border-radius: 10px; border: 1px solid #333; }
        .menu-item-img { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; margin-right: 12px; }
        .menu-item .name { flex: 1; font-size: 1.1em; }
        .menu-item .price { color: #c9a227; margin: 0 12px; }
        .add-btn { background: #c9a227; color: #1a1a1a; border: none; width: 36px; height: 36px; 
          border-radius: 50%; font-size: 1.2em; cursor: pointer; font-weight: bold; }
        .add-btn:hover { background: #e0b83d; }
        .cart { position: fixed; bottom: 0; left: 0; right: 0; background: #2a2a2a; padding: 16px; 
          border-top: 2px solid #c9a227; }
        .cart-items { margin-bottom: 10px; max-height: 120px; overflow-y: auto; }
        .cart-line { display: flex; justify-content: space-between; margin: 4px 0; }
        .cart-total { font-weight: bold; color: #c9a227; font-size: 1.2em; }
        .order-btn { width: 100%; padding: 14px; background: #c9a227; color: #1a1a1a; border: none; 
          border-radius: 8px; font-size: 1.1em; font-weight: bold; cursor: pointer; }
        .order-btn:hover { background: #e0b83d; }
        .order-btn:disabled { background: #555; color: #888; cursor: not-allowed; }
        .success-msg { text-align: center; padding: 20px; color: #4ade80; font-size: 1.2em; }
      </style>
    </head>
    <body>
      <h1>☕ Guud Coffee</h1>
      <p class="table-badge">Masa ${tableId}</p>
      
      <div class="menu-list" id="menuList">${menuItemsHtml}</div>
      
      <div class="cart" id="cart">
        <div class="cart-items" id="cartItems">Sepet boş</div>
        <div class="cart-total" id="cartTotal">Toplam: 0 ₺</div>
        <button class="order-btn" id="orderBtn" disabled>Sipariş Ver</button>
      </div>

      <script>
        const tableId = ${tableId};
        const cart = {};
        
        function renderCart() {
          const items = Object.entries(cart);
          const el = document.getElementById('cartItems');
          const totalEl = document.getElementById('cartTotal');
          const btn = document.getElementById('orderBtn');
          
          if (items.length === 0) {
            el.innerHTML = 'Sepet boş';
            totalEl.textContent = 'Toplam: 0 ₺';
            btn.disabled = true;
            return;
          }
          
          let total = 0;
          el.innerHTML = items.map(([id, {name, price, qty}]) => {
            total += price * qty;
            return '<div class="cart-line"><span>' + name + ' x' + qty + '</span><span>' + (price * qty) + ' ₺</span></div>';
          }).join('');
          totalEl.textContent = 'Toplam: ' + total + ' ₺';
          btn.disabled = false;
        }
        
        document.querySelectorAll('.menu-item').forEach(el => {
          el.querySelector('.add-btn').addEventListener('click', () => {
            const id = el.dataset.id;
            const name = el.dataset.name;
            const price = parseInt(el.dataset.price, 10);
            if (!cart[id]) cart[id] = { name, price, qty: 0 };
            cart[id].qty++;
            renderCart();
          });
        });
        
        document.getElementById('orderBtn').addEventListener('click', async () => {
          const items = Object.entries(cart).map(([id, {name, qty, price}]) => ({ id: parseInt(id), name, qty, price }));
          try {
            const res = await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tableId, items })
            });
            const data = await res.json();
            if (data.ok) {
              Object.keys(cart).forEach(k => delete cart[k]);
              renderCart();
              document.getElementById('menuList').innerHTML = '<p class="success-msg" id="orderStatusMsg">Siparişinizin onaylanması bekleniyor.</p>';
              pollOrderStatus(data.orderId);
            } else {
              alert('Sipariş gönderilemedi.');
            }
          } catch (e) {
            alert('Bağlantı hatası.');
          }
        });
        
        function pollOrderStatus(orderId) {
          const el = document.getElementById('orderStatusMsg');
          if (!el) return;
          const t = setInterval(async () => {
            try {
              const res = await fetch('/api/orders/' + orderId + '/status');
              const data = await res.json();
              if (data.status === 'approved') {
                clearInterval(t);
                el.textContent = 'Siparişiniz onaylandı.';
                el.style.color = '#4ade80';
              }
            } catch (_) {}
          }, 3000);
        }
      </script>
    </body>
    </html>
  `);
});

// ============ SİPARİŞ PANELİ (sadece yetkili) ============
app.get("/panel", adminAuth, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Guud Coffee - Sipariş Paneli</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #1a1a1a; color: #fff; }
        h1 { color: #c9a227; }
        .order-card { background: #2a2a2a; border: 1px solid #333; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
        .order-card .header { display: flex; justify-content: space-between; margin-bottom: 10px; color: #c9a227; font-weight: bold; }
        .order-card .items { color: #ccc; }
        .order-card .time { color: #666; font-size: 0.9em; }
        #orderList { max-width: 500px; }
        .empty { color: #666; }
        .order-actions { margin-top: 10px; display: flex; justify-content: flex-end; }
        .approve-btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; background: #22c55e; color: #041207; font-weight: 600; font-size: 0.9em; }
        .approve-btn:hover { background: #16a34a; }
        .panel-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid #333; }
        .panel-section h2 { color: #c9a227; font-size: 1.2em; }
        .product-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #333; }
        .product-row img { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; }
        .product-row .info { flex: 1; }
        .product-row .name { font-weight: 600; }
        .product-row .price { color: #c9a227; }
        .product-row .acts { display: flex; gap: 8px; }
        .product-row .acts button { padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.85em; }
        .btn-edit { background: #3b82f6; color: #fff; }
        .btn-delete { background: #dc2626; color: #fff; }
        .add-product-form { margin-top: 16px; padding: 16px; background: #2a2a2a; border-radius: 10px; max-width: 400px; }
        .add-product-form input, .add-product-form label { display: block; margin-bottom: 8px; }
        .add-product-form input[type="text"], .add-product-form input[type="number"] { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #444; background: #1a1a1a; color: #fff; }
        .add-product-form .submit { margin-top: 12px; padding: 8px 16px; background: #c9a227; color: #1a1a1a; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
        .edit-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .edit-inline input { padding: 6px; border-radius: 4px; border: 1px solid #444; background: #1a1a1a; color: #fff; width: 120px; }
        .settings-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
      </style>
    </head>
    <body>
      <h1>📋 Sipariş Paneli</h1>
      <p>Gelen siparişler aşağıda görüntülenir. Onaylanan siparişler listeden kaldırılır.</p>
      <div id="orderList" class="empty">Bekleyen sipariş yok.</div>

      <div class="panel-section">
        <h2>Masa Sayısı</h2>
        <p>Dükkandaki masa adedi (QR kod için /menu/1 ... /menu/N)</p>
        <div class="settings-row">
          <input type="number" id="tablesCount" min="1" max="50" value="5" style="width:80px;padding:8px;border-radius:6px;border:1px solid #444;background:#1a1a1a;color:#fff">
          <button type="button" class="submit" id="saveTablesBtn">Kaydet</button>
        </div>
      </div>

      <div class="panel-section">
        <h2>Menüyü Düzenle</h2>
        <p>Ürün ekleyebilir, isim/fiyat/fotoğraf güncelleyebilir veya silebilirsiniz.</p>
        <div id="productList">Yükleniyor...</div>
        <div class="add-product-form">
          <label>Yeni ürün adı</label>
          <input type="text" id="newName" placeholder="Örn: Filtre Kahve">
          <label>Fiyat (₺)</label>
          <input type="number" id="newPrice" min="0" placeholder="45">
          <label>Fotoğraf (isteğe bağlı)</label>
          <input type="file" id="newImage" accept="image/*">
          <button type="button" class="submit" id="addProductBtn">Ürün Ekle</button>
        </div>
      </div>

      <script>
        async function approveOrder(id) {
          try {
            await fetch('/api/orders/' + id + '/approve', {
              method: 'POST',
              credentials: 'include'
            });
            await loadOrders();
          } catch (e) {
            alert('Sipariş onaylanırken hata oluştu.');
          }
        }

        async function loadOrders() {
          const res = await fetch('/api/orders', { credentials: 'include' });
          const data = await res.json();
          const el = document.getElementById('orderList');
          if (!data.orders || data.orders.length === 0) {
            el.innerHTML = 'Bekleyen sipariş yok.';
            el.className = 'empty';
            return;
          }
          el.className = '';
          el.innerHTML = data.orders.map(o => {
            const items = o.items.map(i => i.name + ' x' + i.qty + ' (' + (i.price * i.qty) + ' ₺)').join('<br>');
            const total = o.items.reduce((s, i) => s + i.price * i.qty, 0);
            const time = new Date(o.createdAt).toLocaleTimeString('tr-TR');
            return '<div class="order-card">' +
              '<div class="header">Masa ' + o.tableId + ' <span class="time">' + time + '</span></div>' +
              '<div class="items">' + items + '</div>' +
              '<div style="margin-top:8px;color:#c9a227">Toplam: ' + total + ' ₺</div>' +
              '<div class="order-actions"><button class="approve-btn" onclick="approveOrder(' + o.id + ')">Onayla</button></div>' +
              '</div>';
          }).join('');
        }
        loadOrders();
        setInterval(loadOrders, 5000);

        // ----- Masa sayısı -----
        async function loadSettings() {
          const res = await fetch('/api/settings', { credentials: 'include' });
          const data = await res.json();
          document.getElementById('tablesCount').value = data.tables || 5;
        }
        document.getElementById('saveTablesBtn').onclick = async function() {
          const n = parseInt(document.getElementById('tablesCount').value, 10);
          if (isNaN(n) || n < 1 || n > 50) { alert('Masa sayısı 1-50 arası olmalı.'); return; }
          try {
            const res = await fetch('/api/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tables: n }) });
            const data = await res.json();
            if (data.ok) alert('Masa sayısı kaydedildi.');
            else alert(data.error || 'Kaydetme başarısız.');
          } catch (e) { alert('Bağlantı hatası.'); }
        };
        loadSettings();

        // ----- Menü düzenleme -----
        async function loadProducts() {
          const res = await fetch('/api/products', { credentials: 'include' });
          const data = await res.json();
          const el = document.getElementById('productList');
          if (!data.products || data.products.length === 0) {
            el.innerHTML = 'Henüz ürün yok. Aşağıdan ekleyin.';
            return;
          }
          el.innerHTML = data.products.map(p => {
            const img = p.image ? '<img src="/uploads/' + p.image + '" alt="">' : '<span style="width:48px;height:48px;background:#333;border-radius:8px;display:inline-block;text-align:center;line-height:48px;color:#666">?</span>';
            return '<div class="product-row" data-id="' + p.id + '">' +
              img + '<div class="info"><span class="name">' + escapeHtml(p.name) + '</span><br><span class="price">' + p.price + ' ₺</span></div>' +
              '<div class="acts"><button class="btn-edit" onclick="startEdit(' + p.id + ')">Düzenle</button><button class="btn-delete" onclick="deleteProduct(' + p.id + ')">Sil</button></div>' +
              '<div class="edit-inline" id="edit-' + p.id + '" style="display:none;width:100%">' +
              '<input type="text" id="edit-name-' + p.id + '" value="' + escapeHtml(p.name) + '" placeholder="İsim">' +
              '<input type="number" id="edit-price-' + p.id + '" value="' + p.price + '" placeholder="Fiyat">' +
              '<input type="file" id="edit-image-' + p.id + '" accept="image/*">' +
              '<button class="btn-edit" onclick="saveEdit(' + p.id + ')">Kaydet</button>' +
              '<button class="btn-delete" onclick="cancelEdit(' + p.id + ')">İptal</button>' +
              '</div>' +
              '</div>';
          }).join('');
        }
        function escapeHtml(s) { var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
        function startEdit(id) {
          document.querySelectorAll('.edit-inline').forEach(el => el.style.display = 'none');
          const el = document.getElementById('edit-' + id);
          if (el) el.style.display = 'flex';
        }
        function cancelEdit(id) {
          const el = document.getElementById('edit-' + id);
          if (el) el.style.display = 'none';
        }
        async function saveEdit(id) {
          const name = document.getElementById('edit-name-' + id).value.trim();
          const price = parseInt(document.getElementById('edit-price-' + id).value, 10);
          const fileInput = document.getElementById('edit-image-' + id);
          const form = new FormData();
          form.append('name', name);
          form.append('price', isNaN(price) ? 0 : price);
          if (fileInput.files[0]) form.append('image', fileInput.files[0]);
          try {
            const res = await fetch('/api/products/' + id, { method: 'PUT', credentials: 'include', body: form });
            const data = await res.json();
            if (data.ok) { cancelEdit(id); await loadProducts(); }
            else alert(data.error || 'Güncelleme başarısız.');
          } catch (e) { alert('Bağlantı hatası.'); }
        }
        async function deleteProduct(id) {
          if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
          try {
            const res = await fetch('/api/products/' + id, { method: 'DELETE', credentials: 'include' });
            const data = await res.json();
            if (data.ok) await loadProducts();
            else alert(data.error || 'Silme başarısız.');
          } catch (e) { alert('Bağlantı hatası.'); }
        }
        document.getElementById('addProductBtn').onclick = async function() {
          const name = document.getElementById('newName').value.trim();
          const price = parseInt(document.getElementById('newPrice').value, 10);
          const fileInput = document.getElementById('newImage');
          if (!name || isNaN(price) || price < 0) { alert('İsim ve geçerli fiyat girin.'); return; }
          const form = new FormData();
          form.append('name', name);
          form.append('price', price);
          if (fileInput.files[0]) form.append('image', fileInput.files[0]);
          try {
            const res = await fetch('/api/products', { method: 'POST', credentials: 'include', body: form });
            const data = await res.json();
            if (data.ok) { document.getElementById('newName').value = ''; document.getElementById('newPrice').value = ''; fileInput.value = ''; await loadProducts(); }
            else alert(data.error || 'Ekleme başarısız.');
          } catch (e) { alert('Bağlantı hatası.'); }
        };
        loadProducts();
      </script>
    </body>
    </html>
  `);
});

// ============ API: Sipariş gönder ============
app.post("/api/orders", (req, res) => {
  const { tableId, items } = req.body;
  if (!tableId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "Geçersiz sipariş." });
  }
  const order = {
    id: orderIdCounter++,
    tableId: parseInt(tableId, 10),
    items,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  orders.push(order);
  res.json({ ok: true, orderId: order.id });
});

// ============ API: Siparişleri listele (sadece yetkili) ============
app.get("/api/orders", adminAuth, (req, res) => {
  const pending = orders.filter((o) => o.status !== "approved");
  res.json({ orders: [...pending].reverse() });
});

// ============ API: Siparişi onayla (sadece yetkili) ============
app.post("/api/orders/:id/approve", adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ ok: false, error: "Geçersiz sipariş ID." });
  }
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ ok: false, error: "Sipariş bulunamadı." });
  }
  order.status = "approved";
  return res.json({ ok: true });
});

// ============ API: Sipariş durumu (müşteri polling için, herkese açık) ============
app.get("/api/orders/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ status: "unknown" });
  const order = orders.find((o) => o.id === id);
  if (!order) return res.status(404).json({ status: "unknown" });
  res.json({ status: order.status || "pending" });
});

// ============ API: Ürün listesi (panel / menü) ============
app.get("/api/products", (req, res) => {
  res.json({ products: readProducts() });
});

// ============ API: Ayarlar (masa sayısı) ============
app.get("/api/settings", (req, res) => {
  res.json(readSettings());
});

app.put("/api/settings", adminAuth, (req, res) => {
  const tables = parseInt(req.body && req.body.tables, 10);
  if (Number.isNaN(tables) || tables < 1 || tables > 50) {
    return res.status(400).json({ ok: false, error: "Masa sayısı 1-50 arası olmalı." });
  }
  const s = readSettings();
  s.tables = tables;
  writeSettings(s);
  res.json({ ok: true, settings: s });
});

// ============ API: Ürün ekle (sadece yetkili, multipart: name, price, image) ============
app.post("/api/products", adminAuth, upload.single("image"), (req, res) => {
  const name = (req.body && req.body.name && req.body.name.trim()) || "";
  const price = parseInt(req.body && req.body.price, 10);
  if (!name || Number.isNaN(price) || price < 0) {
    return res
      .status(400)
      .json({ ok: false, error: "İsim ve geçerli fiyat gerekli." });
  }
  const products = readProducts();
  const imageFilename = req.file ? req.file.filename : "";
  const newProduct = {
    id: nextProductId(products),
    name: name.trim(),
    price,
    image: imageFilename,
  };
  products.push(newProduct);
  writeProducts(products);
  res.json({ ok: true, product: newProduct });
});

// ============ API: Ürün güncelle (sadece yetkili) ============
app.put("/api/products/:id", adminAuth, upload.single("image"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id))
    return res.status(400).json({ ok: false, error: "Geçersiz ID." });
  const products = readProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1)
    return res.status(404).json({ ok: false, error: "Ürün bulunamadı." });
  const name =
    (req.body && req.body.name != null && String(req.body.name).trim()) ||
    products[idx].name;
  const priceRaw = req.body && req.body.price;
  const price =
    priceRaw != null && priceRaw !== ""
      ? parseInt(priceRaw, 10)
      : products[idx].price;
  if (Number.isNaN(price) || price < 0)
    return res.status(400).json({ ok: false, error: "Geçersiz fiyat." });
  products[idx].name = name.trim();
  products[idx].price = price;
  if (req.file && req.file.filename) products[idx].image = req.file.filename;
  writeProducts(products);
  res.json({ ok: true, product: products[idx] });
});

// ============ API: Ürün sil (sadece yetkili) ============
app.delete("/api/products/:id", adminAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id))
    return res.status(400).json({ ok: false, error: "Geçersiz ID." });
  const products = readProducts();
  const idx = products.findIndex((p) => p.id === id);
  if (idx === -1)
    return res.status(404).json({ ok: false, error: "Ürün bulunamadı." });
  products.splice(idx, 1);
  writeProducts(products);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Guud Coffee server port ${PORT} üzerinde çalışıyor`);
  const hasAuth = !!(process.env.ADMIN_USER && process.env.ADMIN_PASS);
  console.log(
    `Panel auth: ${hasAuth ? "OK (ADMIN_USER, ADMIN_PASS tanımlı)" : "UYARI: ADMIN_USER veya ADMIN_PASS eksik - /panel 500 verecek"}`,
  );
});
