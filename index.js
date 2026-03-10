// index.js - Guud Coffee QR Menü Uygulaması
const express = require("express");
const path = require("path");

const app = express();

// Port Railway otomatik atıyor, yoksa 3000 kullan
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // :)

// ============ ADMIN BASIC AUTH (Railway: ADMIN_USER, ADMIN_PASS) ============
const adminAuth = (req, res, next) => {
  try {
    const user = process.env.ADMIN_USER || "";
    const pass = process.env.ADMIN_PASS || "";
    if (!user.trim() || !pass) {
      console.error("Panel auth failed: ADMIN_USER veya ADMIN_PASS Railway Variables'da tanımlı değil.");
      return res.status(500).send(
        "Admin kimlik bilgileri tanımlı değil. Railway Dashboard > Variables > ADMIN_USER ve ADMIN_PASS ekleyin."
      );
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Sipariş Paneli"');
      return res.status(401).send("Yetkisiz erişim.");
    }
    const b64 = auth.slice(6).trim();
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    const u = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
    const p = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
    if (u !== user || p !== pass) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Sipariş Paneli"');
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

// ============ MENÜ VERİSİ ============
const menu = [
  { id: 1, name: "Espresso", price: 35 },
  { id: 2, name: "Americano", price: 40 },
  { id: 3, name: "Latte", price: 50 },
  { id: 4, name: "Cappuccino", price: 50 },
  { id: 5, name: "Mocha", price: 55 },
  { id: 6, name: "Sütlü Kahve", price: 45 },
  { id: 7, name: "Türk Kahvesi", price: 40 },
  { id: 8, name: "Çay", price: 25 },
  { id: 9, name: "Çikolatalı Cookie", price: 45 },
  { id: 10, name: "Cheesecake Dilim", price: 55 },
];

// ============ ANA SAYFA ============
app.get("/", (req, res) => {
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
      <p><a href="/menu/1">Masa 1</a> | <a href="/menu/2">Masa 2</a> | <a href="/menu/3">Masa 3</a> | <a href="/menu/4">Masa 4</a> | <a href="/menu/5">Masa 5</a></p>
      <p style="font-size:0.9em;color:#888">QR kod oluşturmak için bu URL'leri <a href="https://www.qr-code-generator.com/" target="_blank" style="color:#c9a227">qr-code-generator.com</a> gibi sitelere yapıştırabilirsiniz.</p>
    </body>
    </html>
  `);
});

// ============ MENÜ SAYFASI (QR ile açılacak: /menu/1, /menu/2, ... /menu/5) ============
app.get("/menu/:tableId", (req, res) => {
  const tableId = parseInt(req.params.tableId, 10);
  if (isNaN(tableId) || tableId < 1 || tableId > 5) {
    return res.status(404).send("Geçersiz masa numarası. 1-5 arası olmalı.");
  }

  const menuItemsHtml = menu
    .map(
      (item) => `
      <div class="menu-item" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
        <span class="name">${item.name}</span>
        <span class="price">${item.price} ₺</span>
        <button class="add-btn">+</button>
      </div>
    `,
    )
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
              document.getElementById('menuList').innerHTML = '<p class="success-msg">✓ Siparişiniz alındı!</p>';
            } else {
              alert('Sipariş gönderilemedi.');
            }
          } catch (e) {
            alert('Bağlantı hatası.');
          }
        });
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
      </style>
    </head>
    <body>
      <h1>📋 Sipariş Paneli</h1>
      <p>Gelen siparişler aşağıda görüntülenir.</p>
      <div id="orderList" class="empty">Bekleyen sipariş yok.</div>

      <script>
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
            return '<div class="order-card"><div class="header">Masa ' + o.tableId + ' <span class="time">' + time + '</span></div><div class="items">' + items + '</div><div style="margin-top:8px;color:#c9a227">Toplam: ' + total + ' ₺</div></div>';
          }).join('');
        }
        loadOrders();
        setInterval(loadOrders, 5000);
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
  res.json({ orders: [...orders].reverse() });
});

app.listen(PORT, () => {
  console.log(`Guud Coffee server port ${PORT} üzerinde çalışıyor`);
  const hasAuth = !!(process.env.ADMIN_USER && process.env.ADMIN_PASS);
  console.log(`Panel auth: ${hasAuth ? "OK (ADMIN_USER, ADMIN_PASS tanımlı)" : "UYARI: ADMIN_USER veya ADMIN_PASS eksik - /panel 500 verecek"}`);
});
