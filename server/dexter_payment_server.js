// เซิร์ฟเวอร์ตัวอย่างสำหรับรับซองทรูมันนี่อัตโนมัติ (Node.js 18+ ไม่ต้องติดตั้งแพ็กเกจเพิ่ม)
// รัน:  PORT=3000 ALLOW_ORIGIN=https://your-store.com node dexter_payment_server.js
// เบอร์รับเงินตั้งได้ที่หลังบ้าน (ระบบรับเงิน) เว็บจะส่งมาให้เอง  ส่วน PHONE=08xxxxxxxx เป็นเบอร์สำรองถ้าเว็บไม่ได้ส่งมา
// จากนั้นใส่ URL  http://เซิร์ฟเวอร์:3000/verify  ในหลังบ้าน > ระบบรับเงิน > URL ของ API
// หมายเหตุ: ใช้ endpoint ที่ไม่เป็นทางการของ TrueMoney อาจเปลี่ยนแปลงได้ ทดสอบด้วยซองยอดเล็กก่อน
const http = require('http'), fs = require('fs');
const PHONE = process.env.PHONE, PORT = process.env.PORT || 3000, ORIGIN = process.env.ALLOW_ORIGIN || '*';
const FILE = 'used_vouchers.json';
const used = new Set(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []);
const MSG = { VOUCHER_NOT_FOUND: 'ไม่พบซองนี้', VOUCHER_EXPIRED: 'ซองหมดอายุแล้ว', VOUCHER_OUT_OF_STOCK: 'ซองนี้ถูกรับไปแล้ว', TARGET_USER_REDEEMED: 'ซองนี้ถูกรับไปแล้ว', CANNOT_GET_OWN_VOUCHER: 'ไม่สามารถรับซองของตัวเองได้' };
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST' || req.url !== '/verify') return send(res, 404, {});
  let b = ''; req.on('data', d => { b += d; if (b.length > 2e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const q = JSON.parse(b);
      if (q.method !== 'tw') return send(res, 200, { success: false }); // PromptPay สลิป: ปล่อยให้แอดมินอนุมัติเอง
      const m = String(q.voucher || '').match(/\?v=([0-9A-Za-z]{10,64})/);
      if (!m) return send(res, 200, { reject: true, message: 'ลิงก์ซองไม่ถูกต้อง' });
      const hash = m[1], phone = /^0\d{9}$/.test(q.phone || '') ? q.phone : PHONE;
      if (!/^0\d{9}$/.test(phone || '')) return send(res, 200, { success: false }); // ยังไม่ได้ตั้งเบอร์รับเงิน
      if (used.has(hash)) return send(res, 200, { reject: true, message: 'ซองนี้ถูกใช้แล้ว' });
      const r = await fetch(`https://gift.truemoney.com/campaign/vouchers/${hash}/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ mobile: phone, voucher_hash: hash }) });
      const j = await r.json().catch(() => ({}));
      const code = j.status && j.status.code;
      if (code === 'SUCCESS') {
        const amount = parseFloat(j.data && j.data.my_ticket && j.data.my_ticket.amount_baht);
        if (!(amount > 0)) return send(res, 200, { success: false });
        used.add(hash); fs.writeFileSync(FILE, JSON.stringify([...used]));
        return send(res, 200, { success: true, amount });
      }
      return send(res, 200, { reject: true, message: MSG[code] || 'ไม่สามารถรับซองนี้ได้' });
    } catch (e) { console.error(e); send(res, 200, { success: false }); }
  });
}).listen(PORT, () => console.log('verify server on :' + PORT));
