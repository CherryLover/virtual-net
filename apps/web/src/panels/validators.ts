import { isValidIp, isValidMask } from "../engine";

export function ipValidator(required: boolean) {
  return (value: string): string | null => {
    const text = value.trim();
    if (!text) return required ? "必填" : null;
    return isValidIp(text) ? null : "不是合法的 IP 地址";
  };
}

export function maskValidator(required: boolean) {
  return (value: string): string | null => {
    const text = value.trim();
    if (!text) return required ? "必填" : null;
    return isValidMask(text) ? null : "不是合法的子网掩码";
  };
}

export function positiveNumberValidator(value: string): string | null {
  const text = value.trim();
  if (!text) return "必填";
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return "必须是正整数";
  return null;
}
