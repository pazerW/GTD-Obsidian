import * as crypto from 'crypto';

const STATIC_SECRET = "mFIjJ8F7TuN0bil3q5mW7dABg6qCSZ"; // 请替换为实际的密钥

/**
 * 生成带时效性的密钥
 * @param expiresIn 有效期（秒）
 * @returns { expires, token }
 */
export function generateSecureKey(expiresIn = 300) {
	const now = Math.floor(Date.now() / 1000);
	const expires = now + expiresIn;
	const data = `${expires}`;
	const token = crypto.createHmac('sha256', STATIC_SECRET).update(data).digest('hex');
	return { expires, token };
}

/**
 * 校验密钥
 * @param expires 时间戳（秒）
 * @param token 待校验token
 * @returns boolean
 */
export function verifySecureKey(expires: number, token: string): boolean {
	const now = Math.floor(Date.now() / 1000);
	if (now > expires) return false;
	const data = `${expires}`;
	const expected = crypto.createHmac('sha256', STATIC_SECRET).update(data).digest('hex');
	return expected === token;
}
