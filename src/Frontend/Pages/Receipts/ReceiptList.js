import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import paymentService from '../../Services/payment.service';
import customerService from '../../Services/customer.service';
import { formatCurrency, formatDate } from '../../Utils/helpers';

// ─── Rounding helper — always 2 decimal places (paise precision) ─────────────
const r2 = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

// ─── GST calculation ──────────────────────────────────────────────────────────
// GST base = net_payout (gross minus TDS) — matches payment controller.
// Prefers backend-computed fields (cgst_amount / sgst_amount) when present.
// eslint-disable-next-line
const calcGST = (p) => {
  if (p.cgst_amount !== undefined && p.sgst_amount !== undefined) {
    const cgstAmt  = r2(p.cgst_amount);
    const sgstAmt  = r2(p.sgst_amount);
    const gstTotal = r2(p.gst_amount !== undefined ? p.gst_amount : cgstAmt + sgstAmt);
    return { hasGST: cgstAmt > 0 || sgstAmt > 0, cgstAmt, sgstAmt, gstTotal };
  }
  const net      = r2(p.net_payout);
  const cgstRate = parseFloat(p.cgst) || 0;
  const sgstRate = parseFloat(p.sgst) || 0;
  const hasGST   = !!(p.gst_no && (cgstRate > 0 || sgstRate > 0));
  const cgstAmt  = hasGST ? r2(net * cgstRate / 100) : 0;
  const sgstAmt  = hasGST ? r2(net * sgstRate / 100) : 0;
  return { hasGST, cgstAmt, sgstAmt, gstTotal: r2(cgstAmt + sgstAmt) };
};

const calcGSTCombined = (gross, tds, cgstRate, sgstRate, hasGstNo) => {
  const net      = r2(gross - tds);
  const hasGST   = !!(hasGstNo && (cgstRate > 0 || sgstRate > 0));
  const cgstAmt  = hasGST ? r2(net * cgstRate / 100) : 0;
  const sgstAmt  = hasGST ? r2(net * sgstRate / 100) : 0;
  return { hasGST, cgstAmt, sgstAmt, gstTotal: r2(cgstAmt + sgstAmt), net };
};
// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtRs = (v) =>
  `Rs.${r2(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONTH_NAMES = {
  '01': 'January',  '02': 'February', '03': 'March',    '04': 'April',
  '05': 'May',      '06': 'June',     '07': 'July',     '08': 'August',
  '09': 'September','10': 'October',  '11': 'November', '12': 'December',
};
const formatPaymentMonth = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[m] || m} ${y}`;
};
const getMonthLabel = (ym) => ym ? `${formatPaymentMonth(ym)} Rent` : 'Rental';

// ─── Group helper: merge installments → one combined row per customer+month ───
const groupPayments = (payments) => {
  const map = {};
  payments.forEach((p) => {
    const key = `${p.customer_id || p.customer_code}_${p.payment_month}`;
    if (!map[key]) {
      map[key] = {
        ...p,
        _gross:    r2(p.gross_amount),
        _tds:      r2(p.tds_amount),
        _net:      r2(p.net_payout),
        _cgstAmt:  r2(p.cgst_amount   || 0),
        _sgstAmt:  r2(p.sgst_amount   || 0),
        _gstTotal: r2(p.gst_amount    || 0),
        _ids:      [p.id],
        _count:    1,
      };
    } else {
      const g = map[key];
      g._gross    = r2(g._gross    + r2(p.gross_amount));
      g._tds      = r2(g._tds      + r2(p.tds_amount));
      g._net      = r2(g._net      + r2(p.net_payout));
      g._cgstAmt  = r2(g._cgstAmt  + r2(p.cgst_amount  || 0));
      g._sgstAmt  = r2(g._sgstAmt  + r2(p.sgst_amount  || 0));
      g._gstTotal = r2(g._gstTotal + r2(p.gst_amount   || 0));
      g._ids.push(p.id);
      g._count++;
    }
  });
  return Object.values(map);
};

// ─── PDF: page geometry ───────────────────────────────────────────────────────
const MARGIN  = 14;
const PAGE_W  = 210;
const PAGE_H  = 297;
const CONT_W  = PAGE_W - MARGIN * 2;
const FOOT_H  = 16;
const BOT_LIM = PAGE_H - FOOT_H - 8;

// ─── PDF helper: draw footer on every page ────────────────────────────────────
const drawPDFFooter = (doc) => {
  const fY = PAGE_H - FOOT_H;
  doc.setFillColor(15, 45, 120);
  doc.rect(0, fY, PAGE_W, FOOT_H, 'F');
  doc.setTextColor(180, 200, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('This is a computer-generated receipt. No signature required.', PAGE_W / 2, fY + 5.5, { align: 'center', baseline: 'middle' });
  doc.text('R-ONE Property Management System  |  accounts@rentalapp.com', PAGE_W / 2, fY + 11, { align: 'center', baseline: 'middle' });
};

// ─── PDF helper: check space & add page if needed ────────────────────────────
const ensureSpace = (doc, y, h) => {
  if (y + h > BOT_LIM) {
    doc.addPage();
    drawPDFFooter(doc);
    return MARGIN + 8;
  }
  return y;
};

// ─── PDF helper: section header bar ──────────────────────────────────────────
const pdfSection = (doc, title, y, color = [15, 45, 120]) => {
  doc.setFillColor(...color);
  doc.roundedRect(MARGIN, y, CONT_W, 7.5, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(title, MARGIN + 4, y + 3.75, { baseline: 'middle' });
  return y + 10;
};

// ─── PDF helper: info grid (2-column) ────────────────────────────────────────
// Draws label–value pairs in two columns; auto-wraps long values.
// Returns the new Y after all rows.
const pdfInfoGrid = (doc, pairs, y, colCount = 2) => {
  const colW  = CONT_W / colCount;
  const LW    = 32;   // fixed label column width
  const ROW_H = 6.5;

  pairs.forEach((pair, i) => {
    if (!pair) return;
    const [label, value] = pair;
    const col     = i % colCount;
    const rowIdx  = Math.floor(i / colCount);
    const rx      = MARGIN + col * colW;
    const ry      = y + rowIdx * ROW_H;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${label}:`, rx + 2, ry, { baseline: 'top' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const maxW = colW - LW - 4;
    const lines = doc.splitTextToSize(String(value || '—'), maxW);
    doc.text(lines, rx + LW, ry, { baseline: 'top' });
  });

  const rows = Math.ceil(pairs.length / colCount);
  return y + rows * ROW_H + 3;
};

// ─── PDF helper: a single highlighted amount row ──────────────────────────────
// eslint-disable-next-line
const pdfAmtRow = (doc, label, value, y, labelColor, valueColor, bgColor) => {
  if (bgColor) {
    doc.setFillColor(...bgColor);
    doc.rect(MARGIN, y - 1, CONT_W, 7, 'F');
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...(labelColor || [22, 32, 58]));
  doc.text(label, MARGIN + 3, y + 2.5, { baseline: 'middle' });
  doc.setTextColor(...(valueColor || [22, 32, 58]));
  doc.text(value, MARGIN + CONT_W - 3, y + 2.5, { align: 'right', baseline: 'middle' });
  return y + 8;
};

// =============================================================================
// PDF GENERATOR
// =============================================================================
const generateReceiptPDF = (group) => {
  // group has combined _gross, _tds, _net, _cgstAmt, _sgstAmt, _gstTotal
  const doc   = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const isNRI = (group.nri_status || '').toLowerCase() === 'yes';
  const gst   = {
    hasGST:   group._gstTotal > 0 || group._cgstAmt > 0,
    cgstAmt:  group._cgstAmt,
    sgstAmt:  group._sgstAmt,
    gstTotal: group._gstTotal,
  };
  // Re-derive if backend didn't supply GST amounts
  if (!gst.hasGST && group.gst_no) {
    const derived = calcGSTCombined(
      group._gross, group._tds,
      parseFloat(group.cgst) || 0,
      parseFloat(group.sgst) || 0,
      group.gst_no,
    );
    gst.hasGST   = derived.hasGST;
    gst.cgstAmt  = derived.cgstAmt;
    gst.sgstAmt  = derived.sgstAmt;
    gst.gstTotal = derived.gstTotal;
  }
  const netTransfer = r2(group._net + gst.gstTotal);

  // ── HEADER BAND ───────────────────────────────────────────────────────────
  doc.setFillColor(15, 45, 120);
  doc.rect(0, 0, PAGE_W, 40, 'F');

  // Accent stripe
  doc.setFillColor(25, 70, 180);
  doc.triangle(0, 40, 55, 0, 0, 0, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RENTAL PAYMENT RECEIPT', PAGE_W / 2, 14, { align: 'center', baseline: 'middle' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('R-ONE Property Management', PAGE_W / 2, 22, { align: 'center', baseline: 'middle' });
  doc.setFontSize(7.5);
  doc.setTextColor(180, 200, 240);
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, PAGE_W / 2, 30, { align: 'center', baseline: 'middle' });

  if (isNRI) {
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(PAGE_W - 34, 5, 20, 7, 1.5, 1.5, 'F');
    doc.setTextColor(30, 20, 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('NRI', PAGE_W - 24, 8.5, { align: 'center', baseline: 'middle' });
  }
  if (group._count > 1) {
    doc.setFillColor(99, 102, 241);
    doc.roundedRect(PAGE_W - 56, 5, 20, 7, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(`${group._count} Inst`, PAGE_W - 46, 8.5, { align: 'center', baseline: 'middle' });
  }

  // ── RECEIPT PILL + STATUS ─────────────────────────────────────────────────
  let y = 46;

  doc.setFillColor(234, 88, 12);
  doc.roundedRect(MARGIN, y, 80, 9.5, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`Receipt: ${group.payment_id || group._ids[0]}`, MARGIN + 40, y + 4.75, { align: 'center', baseline: 'middle' });

  const statusColors = { Completed: [22, 163, 74], Processing: [37, 99, 235], Pending: [202, 138, 4], Failed: [220, 38, 38] };
  const sc = statusColors[group.status] || [100, 116, 139];
  doc.setFillColor(...sc);
  doc.roundedRect(PAGE_W - MARGIN - 52, y, 52, 9.5, 2, 2, 'F');
  doc.text(group.status || '—', PAGE_W - MARGIN - 26, y + 4.75, { align: 'center', baseline: 'middle' });

  y += 14;

  // ── CUSTOMER DETAILS ─────────────────────────────────────────────────────
  const customerPairs = [
    ['Customer',  group.customer_name],
    ['Unit / Floor', `${group.unit_no || '—'} / ${group.floor_no || '—'}`],
    ['Customer ID', group.customer_code],
    ['Agreement', group.agreement_type || group.payment_period],
    ['PAN Number', group.pan_number],
    isNRI ? ['NRI Status', 'Non-Resident Indian'] : null,
  ].filter(Boolean);

  y = ensureSpace(doc, y, 10 + Math.ceil(customerPairs.length / 2) * 6.5 + 6);
  doc.setFillColor(248, 250, 255);
  const custH = Math.ceil(customerPairs.length / 2) * 6.5 + 14;
  doc.roundedRect(MARGIN, y, CONT_W, custH, 2, 2, 'F');
  doc.setDrawColor(210, 220, 245);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONT_W, custH, 2, 2, 'S');
  y = pdfSection(doc, 'CUSTOMER DETAILS', y);
  y = pdfInfoGrid(doc, customerPairs, y, 2);
  y += 2;

  // ── PAYMENT PERIOD ────────────────────────────────────────────────────────
  const periodPairs = [
    ['Rent Period',    getMonthLabel(group.payment_month)],
    ['Payment Date',  formatDate(group.payment_date)],
    group._count > 1 ? ['Installments', `${group._count} combined`] : null,
  ].filter(Boolean);

  y = ensureSpace(doc, y, 10 + Math.ceil(periodPairs.length / 2) * 6.5 + 8);
  doc.setFillColor(248, 250, 255);
  const periodH = Math.ceil(periodPairs.length / 2) * 6.5 + 14;
  doc.roundedRect(MARGIN, y, CONT_W, periodH, 2, 2, 'F');
  doc.setDrawColor(210, 220, 245);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONT_W, periodH, 2, 2, 'S');
  y = pdfSection(doc, 'PAYMENT PERIOD', y, [44, 90, 180]);
  y = pdfInfoGrid(doc, periodPairs, y, 2);
  y += 2;

  // ── AMOUNT BREAKDOWN TABLE ────────────────────────────────────────────────
  y = ensureSpace(doc, y, 16);
  y = pdfSection(doc, 'PAYMENT BREAKDOWN', y, [15, 100, 60]);

  const tableBody = [];
  const monthLabel = getMonthLabel(group.payment_month);

  tableBody.push([
    { content: `Gross Rent — ${monthLabel}`, styles: { fontStyle: 'normal' } },
    { content: fmtRs(group._gross), styles: { halign: 'right' } },
  ]);

  if (gst.hasGST) {
    const cgstRate = parseFloat(group.cgst) || 0;
    const sgstRate = parseFloat(group.sgst) || 0;
    tableBody.push([
      { content: `CGST @ ${cgstRate.toFixed(1)}% (on Net after TDS)`, styles: { textColor: [80, 80, 180] } },
      { content: `+ ${fmtRs(gst.cgstAmt)}`, styles: { halign: 'right', textColor: [80, 80, 180] } },
    ]);
    tableBody.push([
      { content: `SGST @ ${sgstRate.toFixed(1)}% (on Net after TDS)`, styles: { textColor: [80, 80, 180] } },
      { content: `+ ${fmtRs(gst.sgstAmt)}`, styles: { halign: 'right', textColor: [80, 80, 180] } },
    ]);
    tableBody.push([
      { content: 'Total GST', styles: { fontStyle: 'bold', textColor: [60, 80, 200] } },
      { content: `+ ${fmtRs(gst.gstTotal)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: [60, 80, 200] } },
    ]);
  }

  if (group._tds > 0) {
    tableBody.push([
      { content: 'TDS Deduction @ 10%  (Sec. 194-IB)', styles: { textColor: [180, 50, 50] } },
      { content: `(${fmtRs(group._tds)})`, styles: { halign: 'right', textColor: [180, 50, 50] } },
    ]);
  }

  autoTable(doc, {
    startY: y,
    body:   tableBody,
    foot:   [[
      { content: 'NET BANK TRANSFER', styles: { fontStyle: 'bold', fontSize: 10 } },
      { content: fmtRs(netTransfer), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } },
    ]],
    bodyStyles: {
      fontSize: 9, valign: 'middle',
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      lineColor: [220, 228, 245], lineWidth: 0.2,
    },
    footStyles: {
      fillColor: [22, 163, 74], textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 10,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    columnStyles: { 0: { cellWidth: 135 }, 1: { cellWidth: 47 } },
    margin: { left: MARGIN, right: MARGIN },
    tableLineColor: [200, 210, 230],
    tableLineWidth: 0.25,
    willDrawPage: () => drawPDFFooter(doc),
    didDrawPage: () => drawPDFFooter(doc),
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── GST DETAILS ───────────────────────────────────────────────────────────
  if (gst.hasGST) {
    y = ensureSpace(doc, y, 30);
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(MARGIN, y, CONT_W, 24, 2, 2, 'F');
    doc.setDrawColor(147, 197, 253);
    doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN, y, CONT_W, 24, 2, 2, 'S');
    y = pdfSection(doc, 'GST DETAILS', y, [30, 64, 175]);
    const gstPairs = [
      ['GST Number',    group.gst_no || '—'],
      ['Total GST',     fmtRs(gst.gstTotal)],
      ['CGST Rate',     `${parseFloat(group.cgst || 0).toFixed(1)}%`],
      ['CGST Amount',   fmtRs(gst.cgstAmt)],
      ['SGST Rate',     `${parseFloat(group.sgst || 0).toFixed(1)}%`],
      ['SGST Amount',   fmtRs(gst.sgstAmt)],
    ];
    y = pdfInfoGrid(doc, gstPairs, y, 2);
    y += 2;
  }

  // ── BANK DETAILS ─────────────────────────────────────────────────────────
  // Use grid layout — no hardcoded x positions that overflow
  y = ensureSpace(doc, y, 30);
  doc.setFillColor(254, 252, 232);
  doc.roundedRect(MARGIN, y, CONT_W, 24, 2, 2, 'F');
  doc.setDrawColor(253, 220, 100);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONT_W, 24, 2, 2, 'S');
  y = pdfSection(doc, 'BANK DETAILS', y, [133, 77, 14]);
  const bankPairs = [
    ['Account No', group.bank_account_number || '—'],
    ['Bank Name',  group.bank_name           || '—'],
    ['IFSC Code',  group.ifsc_code           || '—'],
  ];
  y = pdfInfoGrid(doc, bankPairs, y, 2);
  y += 2;

  // ── TRANSACTION DETAILS ───────────────────────────────────────────────────
  if (group.transaction_reference || group.razorpay_payment_id) {
    y = ensureSpace(doc, y, 28);
    const txPairs = [
      group.transaction_reference ? ['UTR / Ref No',    group.transaction_reference]  : null,
      group.razorpay_payment_id   ? ['Razorpay ID',     group.razorpay_payment_id]     : null,
      group.completed_date        ? ['Completed Date',  formatDate(group.completed_date)] : null,
    ].filter(Boolean);

    const txH = Math.ceil(txPairs.length / 2) * 6.5 + 14;
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(MARGIN, y, CONT_W, txH, 2, 2, 'F');
    doc.setDrawColor(134, 239, 172);
    doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN, y, CONT_W, txH, 2, 2, 'S');
    y = pdfSection(doc, 'TRANSACTION DETAILS', y, [22, 101, 52]);
    y = pdfInfoGrid(doc, txPairs, y, 2);
    y += 2;
  }

  // ── PAID WATERMARK ────────────────────────────────────────────────────────
  if (group.status === 'Completed') {
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(52);
    doc.setGState(doc.GState({ opacity: 0.07 }));
    doc.text('PAID', PAGE_W / 2, PAGE_H / 2 + 20, { align: 'center', angle: 30, baseline: 'middle' });
    doc.setGState(doc.GState({ opacity: 1 }));
  }

  drawPDFFooter(doc);
  doc.save(`Receipt_${group.payment_id || group._ids[0]}_${(group.customer_name || '').replace(/\s+/g, '_')}.pdf`);
  toast.success('PDF receipt downloaded!');
};

// =============================================================================
// EXCEL GENERATOR
// =============================================================================
const generateReceiptExcel = (group) => {
  const gst = {
    hasGST:   group._gstTotal > 0 || group._cgstAmt > 0,
    cgstAmt:  group._cgstAmt,
    sgstAmt:  group._sgstAmt,
    gstTotal: group._gstTotal,
  };
  if (!gst.hasGST && group.gst_no) {
    const derived = calcGSTCombined(
      group._gross, group._tds,
      parseFloat(group.cgst) || 0,
      parseFloat(group.sgst) || 0,
      group.gst_no,
    );
    Object.assign(gst, derived);
  }
  const netTransfer = r2(group._net + gst.gstTotal);
  const isNRI       = (group.nri_status || '').toLowerCase() === 'yes';
  const monthLabel  = getMonthLabel(group.payment_month);

  const receiptData = [
    ['RENTAL PAYMENT RECEIPT', '', '', ''],
    ['R-ONE Property Management', '', '', ''],
    [''],
    ['CUSTOMER DETAILS', '', '', ''],
    ['Customer Name',  group.customer_name  || '—', 'Receipt No',     group.payment_id || group._ids[0]],
    ['Customer ID',    group.customer_code  || '—', 'Status',         group.status || '—'],
    ['PAN Number',     group.pan_number     || '—', 'Unit No',        group.unit_no || '—'],
    ['Floor No',       group.floor_no       || '—', 'Agreement Type', group.agreement_type || '—'],
    ...(isNRI ? [['NRI Status', 'Non-Resident Indian', '', '']] : []),
    ...(group._count > 1 ? [['Installments', `${group._count} combined installments`, '', '']] : []),
    [''],
    ['PAYMENT DETAILS', '', '', ''],
    ['Rent Period', monthLabel, 'Payment Date', group.payment_date ? formatDate(group.payment_date) : '—'],
    [''],
    ['AMOUNT BREAKDOWN', '', '', ''],
    [`Gross Rent (${monthLabel})`, '', 'Rs.', group._gross],
    ...(gst.hasGST ? [
      [`CGST @ ${parseFloat(group.cgst || 0).toFixed(2)}% (on Net after TDS)`, '', 'Rs.', gst.cgstAmt],
      [`SGST @ ${parseFloat(group.sgst || 0).toFixed(2)}% (on Net after TDS)`, '', 'Rs.', gst.sgstAmt],
      ['Total GST', '', 'Rs.', gst.gstTotal],
    ] : []),
    ...(group._tds > 0 ? [['TDS Deduction (10% Sec.194-IB)', '', 'Rs.', -group._tds]] : []),
    ['Net Rent (after TDS)', '', 'Rs.', group._net],
    ['NET BANK TRANSFER', '', 'Rs.', netTransfer],
    [''],
    ...(gst.hasGST ? [
      ['GST DETAILS', '', '', ''],
      ['GST Number', group.gst_no || '—', 'Total GST Rate', `${(parseFloat(group.cgst || 0) + parseFloat(group.sgst || 0)).toFixed(1)}%`],
      ['CGST Rate', `${parseFloat(group.cgst || 0).toFixed(2)}%`, 'CGST Amount', gst.cgstAmt],
      ['SGST Rate', `${parseFloat(group.sgst || 0).toFixed(2)}%`, 'SGST Amount', gst.sgstAmt],
      [''],
    ] : []),
    ['BANK DETAILS', '', '', ''],
    ['Account No', group.bank_account_number || '—', 'IFSC Code', group.ifsc_code || '—'],
    ['Bank Name', group.bank_name || '—', '', ''],
    ...(group.transaction_reference ? [
      [''],
      ['TRANSACTION DETAILS', '', '', ''],
      ['UTR / Reference No', group.transaction_reference || '—', 'Razorpay ID', group.razorpay_payment_id || '—'],
    ] : []),
  ].filter((r) => r !== null);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(receiptData);
  ws['!cols'] = [{ wch: 36 }, { wch: 28 }, { wch: 22 }, { wch: 18 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ];

  // Style section headers + totals
  receiptData.forEach((row, ri) => {
    const val = row[0];
    const isSec   = ['CUSTOMER DETAILS', 'PAYMENT DETAILS', 'AMOUNT BREAKDOWN', 'BANK DETAILS', 'TRANSACTION DETAILS', 'GST DETAILS'].includes(val);
    const isTotal = val === 'NET BANK TRANSFER';
    if (isSec) {
      for (let ci = 0; ci < 4; ci++) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 9 }, fill: { fgColor: { rgb: '0F2D78' } } };
      }
    }
    if (isTotal) {
      for (let ci = 0; ci < 4; ci++) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        ws[addr].s = { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '16A34A' } } };
      }
    }
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Receipt');
  XLSX.writeFile(wb, `Receipt_${group.payment_id || group._ids[0]}_${(group.customer_name || '').replace(/\s+/g, '_')}.xlsx`);
  toast.success('Excel receipt downloaded!');
};

// =============================================================================
// COMPONENT
// =============================================================================
const ReceiptList = () => {
  const [payments,   setPayments]   = useState([]);
  const [customers,  setCustomers]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [pdfLoading, setPdfLoading] = useState({});
  const [xlsLoading, setXlsLoading] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [filters,    setFilters]    = useState({ customerId: '', startDate: '', endDate: '', status: 'Completed' });
  const [search,     setSearch]     = useState('');

  useEffect(() => { fetchCustomers(); }, []);
  useEffect(() => { 
    fetchPayments(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, filters]);

  const fetchCustomers = async () => {
    try {
      const res = await customerService.getAllCustomers({ limit: 1000 });
      setCustomers(res.data.customers);
    } catch { toast.error('Failed to load customers'); }
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const res = await paymentService.getPaymentHistory({
        page: pagination.page, limit: pagination.limit, ...filters,
      });
      setPayments(res.data.payments || []);
      setPagination((prev) => ({ ...prev, ...res.data.pagination }));
    } catch { toast.error('Failed to load receipts'); }
    finally  { setLoading(false); }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleReset = () => {
    setFilters({ customerId: '', startDate: '', endDate: '', status: 'Completed' });
    setSearch('');
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Group installments into one combined row per customer+month
  const grouped = useMemo(() => groupPayments(payments), [payments]);

  const filtered = useMemo(() =>
    grouped.filter((g) =>
      !search ||
      g.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      (g.payment_id || '').toLowerCase().includes(search.toLowerCase())
    ),
    [grouped, search]
  );

  const statusBadge = (s) =>
    ({ Completed: 'bg-success', Processing: 'bg-primary', Pending: 'bg-warning text-dark', Failed: 'bg-danger' }[s] || 'bg-secondary');

  const handlePDF = (g) => {
    const key = `${g.customer_id || g.customer_code}_${g.payment_month}`;
    setPdfLoading((p) => ({ ...p, [key]: true }));
    try {
      generateReceiptPDF(g);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      setPdfLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleExcel = (g) => {
    const key = `${g.customer_id || g.customer_code}_${g.payment_month}`;
    setXlsLoading((p) => ({ ...p, [key]: true }));
    try {
      generateReceiptExcel(g);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate Excel');
    } finally {
      setXlsLoading((p) => ({ ...p, [key]: false }));
    }
  };

  return (
    <div className="container-fluid">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">
            <i className="bi bi-receipt text-primary me-2"></i>Receipt List
          </h4>
          <p className="text-muted small mb-0">View and download payment receipts (PDF &amp; Excel)</p>
        </div>
        <span className="badge bg-primary fs-6">{pagination.total} Receipts</span>
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label small fw-semibold">Search</label>
              <div className="input-group">
                <span className="input-group-text"><i className="bi bi-search"></i></span>
                <input type="text" className="form-control" placeholder="Customer / Receipt No"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-semibold">Customer</label>
              <select className="form-select" name="customerId" value={filters.customerId} onChange={handleFilterChange}>
                <option value="">All Customers</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_id})</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">Status</label>
              <select className="form-select" name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All</option>
                <option value="Completed">Completed</option>
                <option value="Processing">Processing</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">From</label>
              <input type="date" className="form-control" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
            </div>
            <div className="col-md-2">
              <label className="form-label small fw-semibold">To</label>
              <input type="date" className="form-control" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
            </div>
            <div className="col-12">
              <button className="btn btn-outline-secondary btn-sm" onClick={handleReset}>
                <i className="bi bi-arrow-counterclockwise me-1"></i>Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary"></div>
              <p className="text-muted mt-3">Loading receipts...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-receipt text-muted" style={{ fontSize: '3.5rem', opacity: 0.3 }}></i>
              <h6 className="text-muted mt-3">No receipts found</h6>
              <p className="text-muted small">Try adjusting your filters</p>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.82rem' }}>
                  <thead className="table-light">
                    <tr>
                      <th>Receipt No</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Unit</th>
                      <th>Rent Period</th>
                      <th>Inst</th>
                      <th>GST</th>
                      <th className="text-end">Gross Rent</th>
                      <th className="text-end">TDS</th>
                      <th className="text-end">Net Rent</th>
                      <th className="text-end">GST Amt</th>
                      <th className="text-end fw-bold">Net Transfer</th>
                      <th>NRI</th>
                      <th>Status</th>
                      <th className="text-center">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((g) => {
                      const key    = `${g.customer_id || g.customer_code}_${g.payment_month}`;
                      const gst    = { hasGST: g._gstTotal > 0 || g._cgstAmt > 0, gstTotal: g._gstTotal };
                      if (!gst.hasGST && g.gst_no) {
                        const d = calcGSTCombined(g._gross, g._tds, parseFloat(g.cgst) || 0, parseFloat(g.sgst) || 0, g.gst_no);
                        gst.hasGST  = d.hasGST;
                        gst.gstTotal = d.gstTotal;
                      }
                      const netTransfer = r2(g._net + gst.gstTotal);
                      const isNRI = (g.nri_status || '').toLowerCase() === 'yes';
                      return (
                        <tr key={key}>
                          <td><code className="text-primary fw-semibold small">{g.payment_id || g._ids[0]}</code></td>
                          <td className="text-nowrap small">{formatDate(g.payment_date)}</td>
                          <td>
                            <div className="fw-semibold">{g.customer_name}</div>
                            <small className="text-muted">{g.customer_code}</small>
                          </td>
                          <td>
                            <span className="badge bg-light text-dark border">{g.unit_no || '—'}</span>
                            {g.floor_no && <div className="text-muted" style={{ fontSize: '0.7rem' }}>Fl. {g.floor_no}</div>}
                          </td>
                          <td className="small text-nowrap">{formatPaymentMonth(g.payment_month)}</td>
                          <td>
                            {g._count > 1
                              ? <span className="badge bg-indigo text-white" style={{ background: '#6366f1' }}>{g._count} inst</span>
                              : <span className="text-muted small">1</span>}
                          </td>
                          <td>
                            {g.gst_no
                              ? <span className="badge bg-info text-dark" title={`CGST: ${g.cgst}% | SGST: ${g.sgst}%`}>GST</span>
                              : <span className="text-muted small">—</span>}
                          </td>
                          <td className="text-end small">{formatCurrency(g._gross)}</td>
                          <td className="text-end small text-warning fw-semibold">
                            {g._tds > 0 ? formatCurrency(g._tds) : '—'}
                          </td>
                          <td className="text-end small">{formatCurrency(g._net)}</td>
                          <td className="text-end small text-info">
                            {gst.hasGST ? formatCurrency(gst.gstTotal) : <span className="text-muted">—</span>}
                          </td>
                          <td className="text-end fw-bold text-success">{formatCurrency(netTransfer)}</td>
                          <td>
                            {isNRI
                              ? <span className="badge bg-warning text-dark small">NRI</span>
                              : <span className="text-muted small">—</span>}
                          </td>
                          <td><span className={`badge ${statusBadge(g.status)}`}>{g.status}</span></td>
                          <td className="text-center">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-danger" title="Download PDF"
                                onClick={() => handlePDF(g)} disabled={pdfLoading[key]}>
                                {pdfLoading[key]
                                  ? <span className="spinner-border spinner-border-sm"></span>
                                  : <i className="bi bi-file-earmark-pdf"></i>}
                              </button>
                              <button className="btn btn-outline-success" title="Download Excel"
                                onClick={() => handleExcel(g)} disabled={xlsLoading[key]}>
                                {xlsLoading[key]
                                  ? <span className="spinner-border spinner-border-sm"></span>
                                  : <i className="bi bi-file-earmark-excel"></i>}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="d-flex justify-content-between align-items-center px-3 py-3 border-top">
                <small className="text-muted">
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </small>
                <nav>
                  <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${pagination.page === 1 ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>‹</button>
                    </li>
                    {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => (
                      <li key={i + 1} className={`page-item ${pagination.page === i + 1 ? 'active' : ''}`}>
                        <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: i + 1 }))}>{i + 1}</button>
                      </li>
                    ))}
                    <li className={`page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}`}>
                      <button className="page-link" onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>›</button>
                    </li>
                  </ul>
                </nav>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptList;