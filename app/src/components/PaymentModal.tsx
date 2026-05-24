import { useState } from 'react';
import { getLiffUserId, getLiffDisplayName } from '../lib/liff';
import { PLAN_INFO, EARLY_BIRD_TOTAL, EARLY_BIRD_TAKEN, type Plan } from '../config/plans';

const EARLY_BIRD_ACTIVE = EARLY_BIRD_TOTAL - EARLY_BIRD_TAKEN > 0;

interface Props {
  plan: Exclude<Plan, 'free' | 'extra'>;
  onClose: () => void;
}

export default function PaymentModal({ plan, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const info  = PLAN_INFO[plan];
  const price = EARLY_BIRD_ACTIVE && info.earlyBirdPrice ? info.earlyBirdPrice : info.price;
  const userId      = getLiffUserId() || '';
  const displayName = getLiffDisplayName() || '';
  const memo = `TanNote ${info.label}${displayName ? ` (${displayName})` : ''}`;

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#232325] rounded-t-3xl sm:rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 text-white ${plan === 'pro' ? 'bg-[#E24B4A]' : 'bg-gray-800'}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium opacity-75">อัปเกรดเป็น</p>
              <h2 className="font-bold text-xl">{info.label}</h2>
            </div>
            <div className="text-right">
              {EARLY_BIRD_ACTIVE && info.earlyBirdPrice ? (
                <>
                  <p className="text-xs opacity-50 line-through">฿{info.price.toLocaleString()}</p>
                  <p className="text-2xl font-bold">฿{info.earlyBirdPrice.toLocaleString()}</p>
                  <p className="text-[10px] opacity-70">early bird / เดือน</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold">฿{info.price.toLocaleString()}</p>
                  <p className="text-[10px] opacity-70">/เดือน</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">

          {/* QR code */}
          <div className="flex flex-col items-center">
            {imgError ? (
              <div className="w-52 h-52 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-center px-4">
                <p className="text-xs text-gray-400 dark:text-gray-500">รอ QR code จากผู้ดูแลระบบ<br />(วางไฟล์ที่ /qr-payment.png)</p>
              </div>
            ) : (
              <img
                src="/qr-payment.png"
                alt="QR โอนเงิน"
                className="w-52 h-52 object-contain rounded-2xl border border-gray-200 dark:border-gray-700 bg-white"
                onError={() => setImgError(true)}
              />
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">สแกนเพื่อโอนเงินผ่านธนาคาร</p>
          </div>

          {/* Steps */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">ขั้นตอนการชำระ</p>
            <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>สแกน QR code ด้านบน</li>
              <li>
                โอน{' '}
                <strong className="text-amber-900 dark:text-amber-200">
                  ฿{price.toLocaleString()}
                </strong>{' '}
                และใส่หมายเหตุ:{' '}
                <strong className="text-amber-900 dark:text-amber-200">{memo}</strong>
              </li>
              <li>ถ่ายรูปสลิปการโอน</li>
              <li>
                ส่งสลิป + LINE ID ของคุณ (ด้านล่าง) มาที่{' '}
                <strong className="text-amber-900 dark:text-amber-200">LINE @077vkaxj</strong>
              </li>
            </ol>
          </div>

          {/* User ID */}
          {userId && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                LINE ID ของคุณ <span className="text-gray-400">(แนบมาพร้อมสลิปเพื่อให้ admin ระบุตัวตน)</span>
              </p>
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                <span className="text-xs font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">
                  {userId}
                </span>
                <button
                  onClick={copyUserId}
                  className={`text-xs font-semibold flex-shrink-0 px-2 py-1 rounded-lg transition-colors ${
                    copied
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-[#E24B4A]'
                  }`}
                >
                  {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
                </button>
              </div>
            </div>
          )}

          {/* LINE CTA */}
          <a
            href="https://line.me/R/ti/p/@077vkaxj"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 bg-[#06C755] text-white font-bold py-3.5 rounded-xl text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            แจ้งชำระผ่าน LINE @077vkaxj
          </a>

          <button
            onClick={onClose}
            className="text-sm text-gray-400 dark:text-gray-500 py-1"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
