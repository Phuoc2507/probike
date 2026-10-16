// Điểm vào riêng cho trang thử demo.html (chỉ dùng khi `npm run dev`).
import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.css';
import AssemblerDemo from './AssemblerDemo';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AssemblerDemo />
  </React.StrictMode>,
);
