import type { LoaderFunctionArgs } from '@modern-js/runtime/router';
import { requestLocale } from '../lib/request-locale';

export function loader({ request }: LoaderFunctionArgs) {
  return { locale: requestLocale(request) };
}
