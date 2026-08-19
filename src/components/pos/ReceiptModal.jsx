import React, { useRef } from 'react';
import Modal from '../common/Modal';
import { formatDateTime } from '../../utils/formatters';
import { calcItemTotal } from '../../utils/calculations';
import { formatPaymentLabel, normalizePaymentLines } from '../../utils/payments';
import { branding } from '../../config/branding';

function hasItemDiscount(item) {
  return Number(item.discount || 0) > 0 || Number(item.discountAmount || 0) > 0;
}

function formatReceiptCurrency(amount) {
  return 'P' + Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceiptModal({ transaction, onClose }) {
  const ref = useRef();
  const t = transaction;
  const paymentLines = normalizePaymentLines(t);
  const paidTotal = paymentLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const cashApplied = paymentLines.filter(line => line.method === 'Cash').reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const cashReceived = Number(t.cashReceived || 0);
  const displayPaidTotal = paidTotal - cashApplied + (cashReceived || cashApplied);
  const changeDue = Math.max(0, displayPaidTotal - Number(t.total || 0));

  function handlePrint() {
    const win = window.open('', '_blank', 'width=260,height=700');
    win.document.write('<html><head><title>Receipt</title><style>@page{size:58mm auto;margin:0}*{box-sizing:border-box}html,body{width:58mm;margin:0;padding:0;background:#fff}body{font-family:"Courier New",monospace;font-size:16px;line-height:1.35;color:#000}.receipt{width:58mm!important;max-width:58mm!important;margin:0!important;padding:2mm!important;color:#000!important;background:#fff!important;font-family:"Courier New",monospace!important;font-size:16px!important;line-height:1.35!important}.receipt img{max-width:27mm!important}.receipt-line{display:flex!important;justify-content:space-between!important;gap:2mm!important}.receipt-line span:first-child{min-width:0;overflow-wrap:anywhere}.receipt-divider{border-top:1px dashed #000!important;margin:2mm 0!important}@media print{html,body{width:58mm!important}.receipt{width:58mm!important;page-break-inside:avoid}button{display:none!important}}</style></head><body>');
    win.document.write(ref.current.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  }

  function buildReceiptRows() {
    const rows = [
      { type: 'center', text: branding.businessName, bold: true },
      { type: 'space' },
      { type: 'center', text: 'THIS IS NOT AN OFFICIAL RECEIPT.' },
      { type: 'center', text: 'PLEASE ASK FOR BIR SERVICE INVOICE' },
      { type: 'space' },
      { type: 'text', text: `Receipt No. : ${t.receiptNo}` },
      { type: 'divider' },
    ];

    (t.items || []).forEach(item => {
      rows.push({ type: 'pair', left: `${item.quantity} x ${item.name}`, right: formatReceiptCurrency(calcItemTotal(item)) });
      if (item.modifiers?.length) rows.push({ type: 'text', text: `  ${item.modifiers.map(modifier => modifier.name).join(', ')}` });
      if (item.note) rows.push({ type: 'text', text: `  Note: ${item.note}` });
    });

    rows.push({ type: 'divider' });
    if (t.orderDiscount > 0 || t.orderDiscountAmount > 0) {
      if (t.subtotal) rows.push({ type: 'pair', left: 'Subtotal', right: formatReceiptCurrency(t.subtotal) });
      if (t.orderDiscount > 0) rows.push({ type: 'pair', left: 'Order Discount', right: `-${t.orderDiscount}%` });
      if (t.orderDiscountAmount > 0) rows.push({ type: 'pair', left: 'Order Discount Cash', right: `-${formatReceiptCurrency(t.orderDiscountAmount)}` });
    }
    if (Number(t.discountTotal || 0) > 0) rows.push({ type: 'pair', left: 'Total Discount', right: `-${formatReceiptCurrency(t.discountTotal)}` });

    rows.push({ type: 'pair', left: 'Total:', right: formatReceiptCurrency(t.total), bold: true });
    if (paymentLines.length > 1) {
      paymentLines.forEach(line => rows.push({ type: 'pair', left: line.method, right: formatReceiptCurrency(line.amount) }));
    }
    if (cashReceived > cashApplied) {
      rows.push({ type: 'pair', left: 'Cash Received:', right: formatReceiptCurrency(cashReceived) });
    }
    if (changeDue > 0) {
      rows.push({ type: 'pair', left: 'Change:', right: formatReceiptCurrency(changeDue), bold: true });
    }
    rows.push({ type: 'space' });
    rows.push({ type: 'text', text: `Payment Method: ${formatPaymentLabel(paymentLines)}` });
    rows.push({ type: 'text', text: t.orderType });
    rows.push({ type: 'text', text: `Staff: ${t.staffName || 'Staff'}` });
    rows.push({ type: 'space' });
    rows.push({ type: 'center', text: `--- Powered by ${branding.poweredBy} ---` });
    rows.push({ type: 'center', text: formatDateTime(t.datetime) });
    rows.push({ type: 'center', text: 'THANK YOU! SEE US AGAIN! :)', bold: true });
    return rows;
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || '').split(' ');
    const lines = [];
    let current = '';
    words.forEach(word => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines;
  }

  function loadImage(src) {
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  async function handleSaveImage() {
    const width = 384;
    const padding = 18;
    const lineHeight = 30;
    const logo = await loadImage('/logo.png?v=2');
    const logoWidth = logo ? 104 : 0;
    const logoHeight = logo ? Math.round((logo.height / logo.width) * logoWidth) : 0;
    const logoBlockHeight = logo ? logoHeight + 12 : 0;
    const rows = buildReceiptRows();
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = '21px "Courier New", monospace';
    const rowHeights = rows.map(row => {
      if (row.type === 'space') return 10;
      if (row.type === 'divider') return 18;
      if (row.type === 'pair') return Math.max(1, wrapText(measureCtx, row.left, 198).length) * lineHeight;
      return Math.max(1, wrapText(measureCtx, row.text, width - padding * 2).length) * lineHeight;
    });
    const height = padding * 2 + logoBlockHeight + rowHeights.reduce((sum, h) => sum + h, 0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';

    let y = padding;
    if (logo) {
      ctx.drawImage(logo, (width - logoWidth) / 2, y, logoWidth, logoHeight);
      y += logoBlockHeight;
    }
    rows.forEach((row, index) => {
      ctx.font = `${row.bold ? '700 ' : ''}21px "Courier New", monospace`;
      if (row.type === 'space') {
        y += rowHeights[index];
        return;
      }
      if (row.type === 'divider') {
        ctx.fillText('-'.repeat(42), padding, y);
        y += rowHeights[index];
        return;
      }
      if (row.type === 'center') {
        wrapText(ctx, row.text, width - padding * 2).forEach(line => {
          ctx.fillText(line, (width - ctx.measureText(line).width) / 2, y);
          y += lineHeight;
        });
        return;
      }
      if (row.type === 'pair') {
        const leftLines = wrapText(ctx, row.left, 198);
        leftLines.forEach((line, lineIndex) => {
          ctx.fillText(line, padding, y);
          if (lineIndex === 0) {
            const rightWidth = ctx.measureText(row.right).width;
            ctx.fillText(row.right, width - padding - rightWidth, y);
          }
          y += lineHeight;
        });
        return;
      }
      wrapText(ctx, row.text, width - padding * 2).forEach(line => {
        ctx.fillText(line, padding, y);
        y += lineHeight;
      });
    });

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${t.receiptNo || 'receipt'}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  return (
    <Modal title="Receipt" onClose={onClose} footer={
      <>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
        <button className="btn btn-secondary" onClick={handleSaveImage}>Save Image</button>
        <button className="btn btn-primary" onClick={handlePrint}>Print Receipt</button>
      </>
    }>
      <div ref={ref} className="receipt" style={{ color: '#000', backgroundColor: '#fff', padding: '14px', fontFamily: '"Courier New", Courier, monospace', fontSize: '16px', lineHeight: 1.35 }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <img src={branding.logoUrl} alt={branding.appName} style={{ width: '96px', height: 'auto', marginBottom: '8px' }} />
          <div style={{ fontWeight: 'bold', fontSize: '17px' }}>{branding.businessName}</div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '13px', marginBottom: '10px', lineHeight: '1.25' }}>
          THIS IS NOT AN OFFICIAL RECEIPT.<br />
          PLEASE ASK FOR BIR SERVICE INVOICE
        </div>

        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          THIS IS NOT AN OFFICIAL RECEIPT
        </div>

        <div style={{ marginBottom: '10px' }}>
          Receipt No. : {t.receiptNo}
        </div>

        <div className="receipt-divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

        {(t.items || []).map((item, i) => (
          <div key={i} style={{ marginBottom: '4px' }}>
            <div className="receipt-line" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.quantity} x {item.name}</span>
              <span>{formatReceiptCurrency(calcItemTotal(item))}</span>
            </div>
            {item.modifiers?.length > 0 && <div style={{ fontSize: '14px', paddingLeft: 12 }}>{item.modifiers.map(modifier => modifier.name).join(', ')}</div>}
            {item.note && (
              <div style={{ fontSize: '14px', paddingLeft: '12px', color: '#333', whiteSpace: 'pre-wrap' }}>
                Note: {item.note}
              </div>
            )}
          </div>
        ))}

        <div className="receipt-divider" style={{ borderTop: '1px dashed #000', margin: '8px 0' }} />

        {(t.orderDiscount > 0 || t.orderDiscountAmount > 0) && (
          <div style={{ marginBottom: '8px' }}>
            {t.subtotal && (
              <div className="receipt-line" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span>
                <span>{formatReceiptCurrency(t.subtotal)}</span>
              </div>
            )}
            {t.orderDiscount > 0 && (
              <div className="receipt-line" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Order Discount</span>
                <span>-{t.orderDiscount}%</span>
              </div>
            )}
            {t.orderDiscountAmount > 0 && (
              <div className="receipt-line" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Order Discount Cash</span>
                <span>-{formatReceiptCurrency(t.orderDiscountAmount)}</span>
              </div>
            )}
          </div>
        )}
        {Number(t.discountTotal || 0) > 0 && (
          <div className="receipt-line" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span>Total Discount</span>
            <span>-{formatReceiptCurrency(t.discountTotal)}</span>
          </div>
        )}

        <div style={{ textAlign: 'right', marginBottom: '15px' }}>
          <div className="receipt-line" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
            <span style={{ fontWeight: 'bold' }}>Total:</span>
            <span style={{ fontWeight: 'bold' }}>{formatReceiptCurrency(t.total)}</span>
          </div>
          {paymentLines.length > 1 && paymentLines.map(line => (
            <div key={line.method} className="receipt-line" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
              <span>{line.method}:</span>
              <span>{formatReceiptCurrency(line.amount)}</span>
            </div>
          ))}
          {cashReceived > cashApplied && (
            <div className="receipt-line" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
              <span>Cash Received:</span>
              <span>{formatReceiptCurrency(cashReceived)}</span>
            </div>
          )}
          {changeDue > 0 && (
            <>
              <div className="receipt-line" style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px' }}>
                <span style={{ fontWeight: 'bold' }}>Change:</span>
                <span style={{ fontWeight: 'bold' }}>{formatReceiptCurrency(changeDue)}</span>
              </div>
            </>
          )}
        </div>

        <div style={{ marginBottom: '10px' }}>
          Payment Method: {formatPaymentLabel(paymentLines)}<br />
          {t.orderType}
        </div>

        <div style={{ marginBottom: '15px' }}>
          Staff: {t.staffName || 'Staff'}
        </div>


        <div style={{ textAlign: 'center', fontSize: '14px' }}>
          <div style={{ marginBottom: '4px' }}>--- Powered by {branding.poweredBy} ---</div>
          <div>{formatDateTime(t.datetime)}</div>
          <div style={{ marginTop: '10px', fontWeight: 'bold' }}>THANK YOU! SEE US AGAIN! :)</div>
        </div>
      </div>
    </Modal>
  );
}
