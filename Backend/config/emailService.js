// const nodemailer = require('nodemailer');
// require('dotenv').config();

// let transporter = null;

// const getTransporter = () => {
//   if (transporter) return transporter;

//   const port   = parseInt(process.env.SMTP_PORT || '587', 10);
//   const secure = process.env.SMTP_SECURE === 'true' || port === 465;

//   transporter = nodemailer.createTransport({
//     host:   process.env.SMTP_HOST,
//     port,
//     secure,
//     auth: {
//       user: process.env.SMTP_USER,
//       pass: process.env.SMTP_PASS,
//     },
//     tls: { rejectUnauthorized: false },
//     pool:              true,
//     maxConnections:    300,
//     maxMessages:       100,
//     connectionTimeout: 10000,
//     greetingTimeout:   5000,
//     socketTimeout:     10000,
//   });

//   return transporter;
// };

// const verifyConnection = async () => {
//   try {
//     await getTransporter().verify();
//     console.log('[Email] SMTP connection verified ✓');
//     return true;
//   } catch (err) {
//     console.error('[Email] SMTP connection failed:', err.message);
//     return false;
//   }
// };

// // ─────────────────────────────────────────────────────────────
// // Base layout — 100% table-based for Outlook / Gmail / Apple Mail
// // ─────────────────────────────────────────────────────────────
// const baseTemplate = ({ previewText, bodyContent }) => {
//   const appName  = process.env.APP_NAME  || 'R-ONE';
//   const appUrl   = process.env.APP_URL   || 'https://rone-frontend-dev.azurewebsites.net';
//   const support  = process.env.SMTP_FROM_EMAIL || 'support@r-one.com';
//   const year     = new Date().getFullYear();

//   return `
// <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
//   "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
// <html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml"
//   xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
// <head>
//   <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <meta http-equiv="X-UA-Compatible" content="IE=edge" />
//   <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
//   <meta name="x-apple-disable-message-reformatting" />
//   <title>${appName}</title>
//   <!--[if mso]>
//   <noscript>
//     <xml>
//       <o:OfficeDocumentSettings>
//         <o:PixelsPerInch>96</o:PixelsPerInch>
//       </o:OfficeDocumentSettings>
//     </xml>
//   </noscript>
//   <![endif]-->
//   <style type="text/css">
//     /* Reset */
//     body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
//     table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
//     img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
//     body { margin: 0 !important; padding: 0 !important; width: 100% !important; }

//     /* Force full width on small screens */
//     @media screen and (max-width: 600px) {
//       .email-container { width: 100% !important; max-width: 100% !important; }
//       .email-body-pad  { padding: 28px 20px !important; }
//       .email-head-pad  { padding: 24px 20px !important; }
//       .email-foot-pad  { padding: 20px !important; }
//       .otp-digit       { font-size: 32px !important; letter-spacing: 10px !important; }
//     }
//   </style>
// </head>

// <!--[if mso]>
// <body style="margin:0;padding:0;background-color:#f4f6fb;">
// <![endif]-->
// <!--[if !mso]><!-->
// <body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
// <!--<![endif]-->

//   <!-- Preview text (hidden) -->
//   <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;
//     font-size:1px;color:#f4f6fb;line-height:1px;">${previewText}&nbsp;
//     &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
//     &#8199;&#65279;&#847; &#8199;&#65279;&#847; &#8199;&#65279;&#847;
//   </div>

//   <!-- Outer wrapper -->
//   <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//     width="100%" style="background-color:#f4f6fb;">
//     <tr>
//       <td align="center" style="padding:40px 16px;">

//         <!-- Container -->
//         <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//           class="email-container"
//           style="max-width:560px;width:100%;border-radius:14px;
//                  box-shadow:0 4px 24px rgba(0,0,0,0.08);">

//           <!-- ══ HEADER ══════════════════════════════════════ -->
//           <tr>
//             <td class="email-head-pad"
//               style="background:linear-gradient(135deg,#0f2d78 0%,#1a3fa0 100%);
//                      border-radius:14px 14px 0 0;
//                      padding:32px 40px;text-align:center;">
//               <!--[if mso]>
//               <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//                 align="center"><tr><td>
//               <![endif]-->
//               <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//                 style="display:inline-table;">
//                 <tr>
//                   <!-- Logo icon box -->
//                   <td valign="middle"
//                     style="width:44px;height:44px;background:linear-gradient(135deg,#d4a017,#f0c040);
//                            border-radius:10px;text-align:center;padding:0;">
//                     <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//                       width="44" height="44">
//                       <tr>
//                         <td align="center" valign="middle">
//                           <!-- House SVG fallback for email clients -->
//                           <img src="https://via.placeholder.com/22x22/0f2d78/0f2d78?text=+" 
//                             width="22" height="22" alt="" 
//                             style="display:none;mso-hide:all;" />
//                           <!--[if !mso]><!-->
//                           <span style="font-size:20px;line-height:1;">🏠</span>
//                           <!--<![endif]-->
//                           <!--[if mso]>
//                           <span style="font-family:Arial;font-size:16px;
//                             font-weight:bold;color:#0f2d78;">R</span>
//                           <![endif]-->
//                         </td>
//                       </tr>
//                     </table>
//                   </td>
//                   <!-- Logo text -->
//                   <td valign="middle" style="padding-left:12px;text-align:left;">
//                     <div style="font-family:Arial,Helvetica,sans-serif;
//                       font-size:20px;font-weight:700;color:#ffffff;
//                       letter-spacing:0.02em;line-height:1.2;">${appName}</div>
//                     <div style="font-family:Arial,Helvetica,sans-serif;
//                       font-size:11px;color:rgba(255,255,255,0.65);
//                       letter-spacing:0.12em;text-transform:uppercase;
//                       margin-top:2px;">Property Management</div>
//                   </td>
//                 </tr>
//               </table>
//               <!--[if mso]></td></tr></table><![endif]-->
//             </td>
//           </tr>

//           <!-- ══ BODY ════════════════════════════════════════ -->
//           <tr>
//             <td class="email-body-pad"
//               style="background:#ffffff;padding:40px;
//                      border-left:1px solid #e8eaf0;border-right:1px solid #e8eaf0;">
//               ${bodyContent}
//             </td>
//           </tr>

//           <!-- ══ FOOTER ══════════════════════════════════════ -->
//           <tr>
//             <td class="email-foot-pad"
//               style="background:#f9fafc;border:1px solid #e8eaf0;border-top:none;
//                      border-radius:0 0 14px 14px;padding:24px 40px;text-align:center;">
//               <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//                 font-size:12px;color:#9ca3af;line-height:1.7;">
//                 This email was sent by
//                 <strong style="color:#6b7280;">${appName} Property Management</strong>.<br/>
//                 If you did not request this, please ignore this email or
//                 <a href="mailto:${support}"
//                   style="color:#0f2d78;text-decoration:none;font-weight:600;">
//                   contact support
//                 </a>.<br/><br/>
//                 &copy; ${year} ${appName}. All rights reserved.<br/>
//                 <a href="${appUrl}"
//                   style="color:#0f2d78;text-decoration:none;font-weight:500;">
//                   Visit Portal
//                 </a>
//                 &nbsp;&nbsp;&middot;&nbsp;&nbsp;
//                 <a href="mailto:${support}"
//                   style="color:#0f2d78;text-decoration:none;font-weight:500;">
//                   Support
//                 </a>
//               </p>
//             </td>
//           </tr>

//         </table>
//         <!-- /Container -->

//       </td>
//     </tr>
//   </table>

// </body>
// </html>
//   `.trim();
// };


// // ─────────────────────────────────────────────────────────────
// // OTP email template
// // ─────────────────────────────────────────────────────────────
// const buildOTPEmail = ({ name, otp, expiryMinutes = 2, ipAddress = null }) => {
//   const appName     = process.env.APP_NAME || 'R-ONE';
//   const subject     = `${appName} — Your Password Reset OTP`;
//   const previewText = `Your OTP is ${otp}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

//   // Split OTP digits for individual box display
//   const otpDigits = otp.split('').map(d =>
//     `<td style="padding:0 4px;">
//        <table role="presentation" border="0" cellpadding="0" cellspacing="0">
//          <tr>
//            <td class="otp-digit" align="center" valign="middle"
//              style="width:44px;height:52px;border:2px solid #d4a017;border-radius:10px;
//                     background:#fffbf0;font-family:'Courier New',Courier,monospace;
//                     font-size:28px;font-weight:800;color:#0f2d78;letter-spacing:0;">
//              ${d}
//            </td>
//          </tr>
//        </table>
//      </td>`
//   ).join('');

//   const ipBlock = ipAddress ? `
//     <!-- Warning box -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin:16px 0;">
//       <tr>
//         <td style="background:#fffbeb;border-left:4px solid #f59e0b;
//                    border-radius:6px;padding:14px 16px;">
//           <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//             font-size:13px;color:#92400e;line-height:1.5;">
//             &#9888;&#65039; This request was made from IP address
//             <strong style="color:#78350f;">${ipAddress}</strong>.
//             If this wasn't you, please contact our support team immediately.
//           </p>
//         </td>
//       </tr>
//     </table>` : '';

//   const bodyContent = `
//     <!-- Badge -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0">
//       <tr>
//         <td style="background:#dcfce7;color:#15803d;font-family:Arial,Helvetica,sans-serif;
//           font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;
//           letter-spacing:0.04em;">
//           &#128272; Password Reset Request
//         </td>
//       </tr>
//     </table>

//     <!-- Greeting -->
//     <p style="margin:18px 0 4px;font-family:Arial,Helvetica,sans-serif;
//       font-size:16px;font-weight:600;color:#1f2937;">
//       Hi ${name || 'there'},
//     </p>

//     <!-- Heading -->
//     <h1 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;
//       font-size:24px;font-weight:700;color:#0f1f42;line-height:1.3;">
//       Your password reset OTP
//     </h1>

//     <!-- Intro text -->
//     <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;
//       font-size:15px;color:#4b5563;line-height:1.65;">
//       We received a request to reset the password for your
//       <strong style="color:#111827;">${appName}</strong> account.
//       Use the one-time code below to continue. This code is valid for
//       <strong style="color:#ef4444;">${expiryMinutes} minutes</strong>.
//     </p>

//     <!-- OTP block -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin:0 0 24px;">
//       <tr>
//         <td align="center" style="background:linear-gradient(135deg,#f0f4ff 0%,#fefbf0 100%);
//           border:2px dashed #d4a017;border-radius:14px;padding:28px 20px;">

//           <!-- Label -->
//           <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;
//             font-size:11px;font-weight:700;letter-spacing:0.14em;
//             text-transform:uppercase;color:#6b7280;">
//             Your One-Time Password
//           </p>

//           <!-- Individual digit boxes -->
//           <table role="presentation" border="0" cellpadding="0" cellspacing="0"
//             style="margin:0 auto;">
//             <tr>${otpDigits}</tr>
//           </table>

//           <!-- Expiry note -->
//           <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;
//             font-size:13px;color:#9ca3af;">
//             Expires in
//             <strong style="color:#ef4444;">${expiryMinutes} minutes</strong>
//           </p>

//         </td>
//       </tr>
//     </table>

//     <!-- Info box -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin-bottom:16px;">
//       <tr>
//         <td style="background:#f0f9ff;border-left:4px solid #0ea5e9;
//                    border-radius:6px;padding:14px 16px;">
//           <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//             font-size:13px;color:#0369a1;line-height:1.5;">
//             &#8505;&#65039; Enter this code on the verification screen. 
//             If you did not request a password reset, you can safely ignore this 
//             email &mdash; your account remains secure.
//           </p>
//         </td>
//       </tr>
//     </table>

//     ${ipBlock}

//     <!-- Divider -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin:24px 0 16px;">
//       <tr>
//         <td style="height:1px;background:#e8eaf0;font-size:0;line-height:0;">&nbsp;</td>
//       </tr>
//     </table>

//     <!-- Security note -->
//     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//       font-size:13px;color:#9ca3af;line-height:1.5;">
//       &#128274; Never share this OTP with anyone &mdash;
//       our team will <strong>never</strong> ask for it.
//     </p>
//   `;

//   return {
//     subject,
//     html: baseTemplate({ previewText, bodyContent }),
//     text:
//       `Hi ${name},\n\n` +
//       `Your ${appName} password reset OTP is: ${otp}\n\n` +
//       `This code expires in ${expiryMinutes} minutes.\n\n` +
//       (ipAddress ? `Request made from IP: ${ipAddress}\n\n` : '') +
//       `If you did not request this, please ignore this email.\n\n` +
//       `— ${appName} Team`,
//   };
// };


// // ─────────────────────────────────────────────────────────────
// // Password changed confirmation
// // ─────────────────────────────────────────────────────────────
// const buildPasswordChangedEmail = ({ name }) => {
//   const appName     = process.env.APP_NAME || 'R-ONE';
//   const support     = process.env.SMTP_FROM_EMAIL || 'support@r-one.com';
//   const subject     = `${appName} — Password Changed Successfully`;
//   const previewText = `Your ${appName} account password was changed successfully.`;

//   const changedAt = new Date().toLocaleString('en-IN', {
//     day: '2-digit', month: 'short', year: 'numeric',
//     hour: '2-digit', minute: '2-digit', hour12: true,
//   });

//   const bodyContent = `
//     <!-- Badge -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0">
//       <tr>
//         <td style="background:#dcfce7;color:#15803d;font-family:Arial,Helvetica,sans-serif;
//           font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;
//           letter-spacing:0.04em;">
//           &#9989; Password Updated
//         </td>
//       </tr>
//     </table>

//     <p style="margin:18px 0 4px;font-family:Arial,Helvetica,sans-serif;
//       font-size:16px;font-weight:600;color:#1f2937;">
//       Hi ${name || 'there'},
//     </p>

//     <h1 style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;
//       font-size:24px;font-weight:700;color:#0f1f42;line-height:1.3;">
//       Password changed successfully
//     </h1>

//     <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;
//       font-size:15px;color:#4b5563;line-height:1.65;">
//       Your <strong style="color:#111827;">${appName}</strong> account password was
//       successfully changed on
//       <strong style="color:#111827;">${changedAt}</strong>.
//     </p>

//     <!-- Success info box -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin-bottom:16px;">
//       <tr>
//         <td style="background:#f0f9ff;border-left:4px solid #0ea5e9;
//                    border-radius:6px;padding:14px 16px;">
//           <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//             font-size:13px;color:#0369a1;line-height:1.5;">
//             &#9989; You can now sign in with your new password.
//             All active sessions have been signed out for your security.
//           </p>
//         </td>
//       </tr>
//     </table>

//     <!-- Warning box -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin-bottom:24px;">
//       <tr>
//         <td style="background:#fffbeb;border-left:4px solid #f59e0b;
//                    border-radius:6px;padding:14px 16px;">
//           <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//             font-size:13px;color:#92400e;line-height:1.5;">
//             &#9888;&#65039; If you did not make this change, please contact our support team at
//             <a href="mailto:${support}"
//               style="color:#78350f;font-weight:700;text-decoration:none;">
//               ${support}
//             </a> immediately.
//           </p>
//         </td>
//       </tr>
//     </table>

//     <!-- Divider -->
//     <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"
//       style="margin-bottom:16px;">
//       <tr>
//         <td style="height:1px;background:#e8eaf0;font-size:0;line-height:0;">&nbsp;</td>
//       </tr>
//     </table>

//     <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
//       font-size:13px;color:#9ca3af;line-height:1.5;">
//       &#128274; For your security, never share your password with anyone.
//     </p>
//   `;

//   return {
//     subject,
//     html: baseTemplate({ previewText, bodyContent }),
//     text:
//       `Hi ${name},\n\n` +
//       `Your ${appName} password was successfully changed on ${changedAt}.\n\n` +
//       `All active sessions have been signed out.\n\n` +
//       `If you did not do this, contact support immediately at ${support}.\n\n` +
//       `— ${appName} Team`,
//   };
// };


// // ─────────────────────────────────────────────────────────────
// // Core send
// // ─────────────────────────────────────────────────────────────
// const sendEmail = async ({ to, subject, html, text }) => {
//   const fromName  = process.env.SMTP_FROM_NAME  || process.env.APP_NAME || 'R-ONE';
//   const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

//   try {
//     const info = await getTransporter().sendMail({
//       from:    `"${fromName}" <${fromEmail}>`,
//       to,
//       subject,
//       html,
//       text,
//       headers: {
//         'X-Mailer':   'R-ONE Property Management',
//         'X-Priority': '1',
//         'Precedence': 'transactional',
//       },
//     });
//     console.log(`[Email] Sent to ${to} — Message-ID: ${info.messageId}`);
//     return { success: true, messageId: info.messageId };
//   } catch (err) {
//     console.error(`[Email] Failed to send to ${to}:`, err.message);
//     throw new Error(`Email delivery failed: ${err.message}`);
//   }
// };


// // ─────────────────────────────────────────────────────────────
// // Public API
// // ─────────────────────────────────────────────────────────────
// const sendOTPEmail = async ({ to, name, otp, expiryMinutes = 5, ipAddress = null }) => {
//   const template = buildOTPEmail({ name, otp, expiryMinutes, ipAddress });
//   return sendEmail({ to, ...template });
// };

// const sendPasswordChangedEmail = async ({ to, name }) => {
//   const template = buildPasswordChangedEmail({ name });
//   return sendEmail({ to, ...template });
// };

// module.exports = { sendOTPEmail, sendPasswordChangedEmail, verifyConnection };


const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const port   = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    pool:              true,
    maxConnections:    10,
    maxMessages:       100,
    connectionTimeout: 10000,
    greetingTimeout:   10000,
    socketTimeout:     15000,
  });

  return transporter;
};

const verifyConnection = async () => {
  try {
    await getTransporter().verify();
    console.log('[Email] SMTP connection verified ✓');
    return true;
  } catch (err) {
    console.error('[Email] SMTP connection failed:', err.message);
    return false;
  }
};

const baseTemplate = ({ previewText, bodyContent }) => {
  const appName = process.env.APP_NAME         || 'R-ONE';
  const appUrl  = process.env.APP_URL          || 'https://rone-frontend-dev.azurewebsites.net';
  const support = process.env.SMTP_FROM_EMAIL  || 'support@r-one.com';
  const year    = new Date().getFullYear();

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${appName}</title>
  <style type="text/css">
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
    img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none}
    body{margin:0!important;padding:0!important;width:100%!important;background-color:#eef0f6}
    @media screen and (max-width:600px){
      .email-wrap{width:100%!important}
      .email-body{padding:28px 18px!important}
      .email-head{padding:20px 18px!important}
      .email-foot{padding:18px!important}
      .otp-cell{width:38px!important;height:46px!important;font-size:24px!important}
      .cta-btn{padding:13px 28px!important;font-size:14px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eef0f6;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#eef0f6;line-height:1px;">
    ${previewText}&nbsp;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background-color:#eef0f6;">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <table role="presentation" class="email-wrap" cellpadding="0" cellspacing="0" border="0"
          style="max-width:580px;width:100%;">

          <!-- ══════════ HEADER ══════════ -->
          <tr>
            <td class="email-head"
              style="background:linear-gradient(150deg,#0b2060 0%,#163794 60%,#1e4db7 100%);
                     border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">

            </td>
          </tr>

          <!-- ══════════ BODY ══════════ -->
          <tr>
            <td class="email-body"
              style="background:#ffffff;padding:40px;
                     border-left:1px solid #dde1ed;border-right:1px solid #dde1ed;">
              ${bodyContent}
            </td>
          </tr>

          <!-- ══════════ FOOTER ══════════ -->
          <tr>
            <td class="email-foot"
              style="background:#f7f8fc;border:1px solid #dde1ed;border-top:none;
                     border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
                font-size:12px;color:#9ca3af;line-height:1.8;">
                This email was sent by
                <strong style="color:#6b7280;">${appName} Property Management</strong>.<br/>
                If you did not request this, please ignore or
                <a href="mailto:${support}"
                  style="color:#163794;text-decoration:none;font-weight:600;">contact support</a>.<br/><br/>
                &copy; ${year} ${appName}. All rights reserved.&nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="${appUrl}" style="color:#163794;text-decoration:none;font-weight:500;">Visit Portal</a>
                &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                <a href="mailto:${support}" style="color:#163794;text-decoration:none;font-weight:500;">Support</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────
const badge = (color, bg, text) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
    <tr>
      <td style="background:${bg};color:${color};font-family:Arial,Helvetica,sans-serif;
        font-size:12px;font-weight:700;padding:5px 14px;border-radius:20px;
        letter-spacing:0.05em;white-space:nowrap;">
        ${text}
      </td>
    </tr>
  </table>`;

const infoBox = (borderColor, bgColor, textColor, html) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin-bottom:16px;">
    <tr>
      <td style="background:${bgColor};border-left:4px solid ${borderColor};
                 border-radius:0 8px 8px 0;padding:14px 16px;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;
          font-size:13px;color:${textColor};line-height:1.6;">${html}</p>
      </td>
    </tr>
  </table>`;

const ctaButton = (url, label, appName) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:24px 0;">
    <tr>
      <td align="center">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
          href="${url}" style="height:50px;v-text-anchor:middle;width:230px;"
          arcsize="10%" fillcolor="#163794" stroke="f">
          <w:anchorlock/><center style="color:#fff;font-family:Arial;font-size:15px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${url}" class="cta-btn"
          style="display:inline-block;background:linear-gradient(135deg,#0b2060,#163794);
                 color:#ffffff;font-family:Arial,Helvetica,sans-serif;
                 font-size:15px;font-weight:700;text-decoration:none;
                 padding:15px 40px;border-radius:8px;letter-spacing:0.03em;
                 mso-hide:all;">
          ${label}
        </a>
        <!--<![endif]-->
      </td>
    </tr>
  </table>`;

const divider =
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="margin:28px 0 20px;">
    <tr><td style="height:1px;background:#e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>`;


// ─────────────────────────────────────────────────────────────────────────────
// 1. WELCOME EMAIL — sent on account creation
// ─────────────────────────────────────────────────────────────────────────────
const buildWelcomeEmail = ({ name, email, password, role, department }) => {
  const appName  = process.env.APP_NAME         || 'R-ONE';
  const loginUrl = process.env.APP_URL          || 'https://rone-frontend-dev.azurewebsites.net';
  const support  = process.env.SMTP_FROM_EMAIL  || 'support@r-one.com';

  const subject     = `Welcome to ${appName} — Your Account is Ready`;
  const previewText = `Your ${appName} account has been created. Here are your login credentials.`;

  const credRow = (label, value, mono = false) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:12px;">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;
          text-transform:uppercase;letter-spacing:0.06em;vertical-align:top;
          padding-top:3px;width:110px;">${label}</td>
        <td style="font-family:${mono ? "'Courier New',Courier,monospace" : 'Arial,Helvetica,sans-serif'};
          font-size:14px;font-weight:700;color:#111827;word-break:break-all;">${value}</td>
      </tr>
    </table>`;

  const bodyContent = `
    ${badge('#166534', '#dcfce7', '&#127881; Account Created')}

    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;
      font-size:17px;font-weight:700;color:#111827;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;
      font-size:15px;color:#4b5563;line-height:1.7;">
      Welcome to <strong style="color:#0b2060;">${appName}</strong> Property Management!
      Your account has been set up by an administrator.
      Use the credentials below to sign in for the first time.
    </p>

    <!-- Credentials card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:24px;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,#f0f4ff,#fefbf0);
          border:1.5px solid #c7d2fe;border-radius:12px;padding:24px 26px;">

          <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;
            font-size:11px;font-weight:700;letter-spacing:0.12em;
            text-transform:uppercase;color:#6b7280;">
            &#128274; Your Login Credentials
          </p>

          ${credRow('Email', email, true)}
          ${credRow('Password', password, true)}
          ${credRow('Role', role || '—')}
          ${credRow('Department', department || '—')}

        </td>
      </tr>
    </table>

    <!-- Login URL pill -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:20px;">
      <tr>
        <td style="background:#f0f4ff;border-left:4px solid #163794;
                   border-radius:0 8px 8px 0;padding:14px 16px;">
          <p style="margin:0 0 5px;font-family:Arial,Helvetica,sans-serif;
            font-size:11px;font-weight:700;letter-spacing:0.1em;
            text-transform:uppercase;color:#6b7280;">Portal URL</p>
          <a href="${loginUrl}"
            style="font-family:'Courier New',Courier,monospace;font-size:13px;
              color:#163794;font-weight:700;word-break:break-all;text-decoration:none;">
            ${loginUrl}
          </a>
        </td>
      </tr>
    </table>

    ${ctaButton(loginUrl, `Sign In to ${appName} &rarr;`, appName)}

    ${infoBox('#f59e0b', '#fffbeb', '#92400e',
      '&#9888; Please <strong>change your password immediately</strong> after your first login. Never share these credentials with anyone.'
    )}

    ${divider}

    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9ca3af;line-height:1.6;">
      Need help? Email us at
      <a href="mailto:${support}" style="color:#163794;text-decoration:none;font-weight:600;">${support}</a>
    </p>
  `;

  return {
    subject,
    html: baseTemplate({ previewText, bodyContent }),
    text:
      `Hi ${name},\n\n` +
      `Your ${appName} account has been created.\n\n` +
      `Email:      ${email}\n` +
      `Password:   ${password}\n` +
      `Role:       ${role || '—'}\n` +
      `Department: ${department || '—'}\n\n` +
      `Login at: ${loginUrl}\n\n` +
      `Please change your password after your first login.\n\n` +
      `— ${appName} Team`,
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// 2. OTP EMAIL — sent for password reset
// ─────────────────────────────────────────────────────────────────────────────
const buildOTPEmail = ({ name, otp, expiryMinutes = 5, ipAddress = null }) => {
  const appName = process.env.APP_NAME || 'R-ONE';
  // Ensure otp is always treated as a string
  const otpStr  = String(otp);

  const subject     = `${appName} — Your Password Reset Code`;
  const previewText = `Your OTP is ${otpStr}. Valid for ${expiryMinutes} minutes. Do not share this code.`;

  // Build individual digit boxes
  const otpDigits = otpStr.split('').map(d =>
    `<td style="padding:0 5px;">
       <table role="presentation" cellpadding="0" cellspacing="0" border="0">
         <tr>
           <td class="otp-cell" align="center" valign="middle"
             style="width:46px;height:54px;border:2px solid #c7d2fe;
                    border-radius:10px;background:#f5f7ff;
                    font-family:'Courier New',Courier,monospace;
                    font-size:30px;font-weight:900;color:#0b2060;">
             ${d}
           </td>
         </tr>
       </table>
     </td>`
  ).join('');

  const ipBlock = ipAddress
    ? infoBox('#f59e0b', '#fffbeb', '#92400e',
        `&#9888; This request originated from IP <strong>${ipAddress}</strong>. If this wasn't you, contact support immediately.`
      )
    : '';

  const bodyContent = `
    ${badge('#c2410c', '#ffedd5', '&#128272; Password Reset')}

    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;
      font-size:17px;font-weight:700;color:#111827;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;
      font-size:15px;color:#4b5563;line-height:1.7;">
      We received a password reset request for your
      <strong style="color:#0b2060;">${appName}</strong> account.
      Enter the code below on the verification screen.
      It expires in <strong style="color:#dc2626;">${expiryMinutes} minutes</strong>.
    </p>

    <!-- OTP display -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin-bottom:24px;">
      <tr>
        <td align="center"
          style="background:linear-gradient(135deg,#f0f4ff,#f5f3ff);
                 border:1.5px dashed #a5b4fc;border-radius:14px;padding:30px 20px;">

          <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;
            font-size:11px;font-weight:700;letter-spacing:0.14em;
            text-transform:uppercase;color:#6b7280;">
            One-Time Password
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0"
            style="margin:0 auto;">
            <tr>${otpDigits}</tr>
          </table>

          <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;
            font-size:13px;color:#9ca3af;">
            Expires in
            <strong style="color:#dc2626;">${expiryMinutes} min</strong>
          </p>
        </td>
      </tr>
    </table>

    ${infoBox('#0ea5e9', '#f0f9ff', '#0369a1',
      'Enter this code on the verification screen. If you did not request a reset, ignore this email &mdash; your account is safe.'
    )}

    ${ipBlock}

    ${divider}

    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9ca3af;line-height:1.6;">
      &#128274; Never share this OTP &mdash; our team will <strong>never</strong> ask for it.
    </p>
  `;

  return {
    subject,
    html: baseTemplate({ previewText, bodyContent }),
    text:
      `Hi ${name},\n\n` +
      `Your ${appName} password reset OTP is: ${otpStr}\n\n` +
      `This code expires in ${expiryMinutes} minutes.\n\n` +
      (ipAddress ? `Request from IP: ${ipAddress}\n\n` : '') +
      `If you did not request this, ignore this email.\n\n` +
      `— ${appName} Team`,
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// 3. PASSWORD CHANGED EMAIL — confirmation after successful reset
// ─────────────────────────────────────────────────────────────────────────────
const buildPasswordChangedEmail = ({ name }) => {
  const appName  = process.env.APP_NAME         || 'R-ONE';
  const loginUrl = process.env.APP_URL          || 'https://rone-frontend-dev.azurewebsites.net';
  const support  = process.env.SMTP_FROM_EMAIL  || 'support@r-one.com';

  const subject     = `${appName} — Password Changed Successfully`;
  const previewText = `Your ${appName} password was changed successfully. Sign in with your new password.`;

  const changedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const bodyContent = `
    ${badge('#166534', '#dcfce7', '&#9989; Password Updated')}

    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;
      font-size:17px;font-weight:700;color:#111827;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 28px;font-family:Arial,Helvetica,sans-serif;
      font-size:15px;color:#4b5563;line-height:1.7;">
      Your <strong style="color:#0b2060;">${appName}</strong> account password was
      successfully changed on <strong style="color:#111827;">${changedAt}</strong>.
    </p>

    ${infoBox('#22c55e', '#f0fdf4', '#166534',
      '&#9989; You can now sign in with your new password. All previous sessions have been signed out for your security.'
    )}

    ${infoBox('#f59e0b', '#fffbeb', '#92400e',
      `&#9888; If you did not make this change, contact support immediately at <a href="mailto:${support}" style="color:#92400e;font-weight:700;text-decoration:none;">${support}</a>`
    )}

    ${ctaButton(loginUrl, 'Sign In Now &rarr;', appName)}

    ${divider}

    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9ca3af;line-height:1.6;">
      &#128274; For your security, never share your password with anyone.
    </p>
  `;

  return {
    subject,
    html: baseTemplate({ previewText, bodyContent }),
    text:
      `Hi ${name},\n\n` +
      `Your ${appName} password was changed on ${changedAt}.\n\n` +
      `All active sessions have been signed out.\n\n` +
      `If you did not do this, contact support at ${support} immediately.\n\n` +
      `Sign in: ${loginUrl}\n\n` +
      `— ${appName} Team`,
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// Core send — wraps nodemailer with structured logging
// ─────────────────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text }) => {
  const fromName  = process.env.SMTP_FROM_NAME  || process.env.APP_NAME || 'R-ONE';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  if (!fromEmail) {
    throw new Error('SMTP_FROM_EMAIL or SMTP_USER env variable is required');
  }

  const mailOptions = {
    from:    `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text,
    headers: {
      'X-Mailer':   'R-ONE Property Management',
      'X-Priority': '1',
      'Precedence': 'transactional',
    },
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[Email] ✓ Delivered to ${to} | Subject: "${subject}" | MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ✗ Failed to ${to} | Subject: "${subject}" | Error: ${err.message}`);
    throw new Error(`Email delivery failed: ${err.message}`);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send welcome email with credentials after account creation.
 */
const sendWelcomeEmail = async ({ to, name, email, password, role, department }) => {
  const template = buildWelcomeEmail({ name, email, password, role, department });
  return sendEmail({ to, ...template });
};

/**
 * Send OTP email for password reset.
 * @param {string|number} opts.otp - The OTP (string or number, both accepted)
 */
const sendOTPEmail = async ({ to, name, otp, expiryMinutes = 2, ipAddress = null }) => {
  // Guard: ensure otp is not null/undefined before building template
  if (otp === null || otp === undefined) {
    throw new Error('sendOTPEmail: otp value is required');
  }
  const template = buildOTPEmail({ name, otp, expiryMinutes, ipAddress });
  return sendEmail({ to, ...template });
};

/**
 * Send password-changed confirmation email.
 */
const sendPasswordChangedEmail = async ({ to, name }) => {
  const template = buildPasswordChangedEmail({ name });
  return sendEmail({ to, ...template });
};

module.exports = {
  sendWelcomeEmail,
  sendOTPEmail,
  sendPasswordChangedEmail,
  verifyConnection,
};