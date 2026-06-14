import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route as accessible without a JWT (login, register, webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
