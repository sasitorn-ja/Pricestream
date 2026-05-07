# CPAC Dashboard

Dashboard สำหรับวิเคราะห์ว่าโครงการไหนยังขึ้นราคาไม่ถึงเป้า `300 บาท` โดยใช้ `NP_AVG` เป็น `net price` และดึงข้อมูลสดจาก DataOcean API

## Logic ที่ใช้

- Baseline: ใช้ข้อมูลวันที่ `2026-03-01` ถึง `2026-03-24`
- Campaign tracking: ใช้ข้อมูลตั้งแต่ `2026-03-25` เป็นต้นไป
- Metric หลัก: `increaseAmount = max(current net price - baseline net price, 0)`
- เปอร์เซ็นต์ความสำเร็จ: `(increaseAmount / 300) * 100`
- การ์ด `Total increase`: ค่าเพิ่มราคาแบบ weighted B/Q โดยใช้ `SUMQ` เป็นน้ำหนัก
- การ์ด `Average to target`: สัดส่วนโครงการที่อยู่ใน ladder `300-399`, `400-499`, หรือ `500+`
- Step ladder:
  - `500+`
  - `400-499`
  - `300-399`
  - `200-299`
  - `100-199`
  - `0-99` รวมทั้งกรณีที่ยังต่ำกว่า baseline

ค่า baseline และ post-campaign net price ถูกคำนวณแบบ weighted average โดยใช้ `SUMQ` เป็นน้ำหนัก

## Run

1. ติดตั้งแพ็กเกจ
   `npm install`
2. รัน dashboard
   `npm run dev`

Frontend จะอยู่ที่ `http://localhost:5173`
Backend API จะอยู่ที่ `http://localhost:8787`

## Data Source

ตั้งค่า DataOcean API ใน `.env`

## Auth Setup

ถ้าใช้ระบบอนุมัติผู้ใช้งานผ่านอีเมล ให้ตั้งค่า SMTP เพิ่มใน `.env`

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=devcpacadmin@gmail.com
SMTP_PASS="your-gmail-app-password"
MAIL_FROM="CPAC Dashboard <devcpacadmin@gmail.com>"
```

สำหรับ production ให้เปลี่ยนเป็น URL จริงของหน้าแอป เช่น `https://your-app.vercel.app`

## Vercel

รองรับแล้ว โดยแนะนำให้ตั้ง Environment Variables ใน Vercel:

```bash
DATAOCEAN_API_URL=https://dataocean.scg.com/api/broker/json/723ebc9c-71f9-4468-9dc7-75685b54005a?from=web-api
DATAOCEAN_API_TOKEN=YOUR_TOKEN
```

พฤติกรรมของระบบ:

- บน local: ดึงข้อมูลจาก DataOcean API แล้ว cache ผลวิเคราะห์ไว้ใน memory ชั่วคราว
- บน Vercel serverless: ดึงข้อมูลจาก DataOcean API โดยตรงและ cache ผลวิเคราะห์ไว้ใน memory ชั่วคราว

หมายเหตุสำหรับ Vercel:
- API จะถูกรันผ่าน Vercel Serverless Functions ที่ path `/api/*`
