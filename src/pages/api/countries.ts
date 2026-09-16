import type { APIRoute } from 'astro';
import { countryOptions } from '@/lib/server/countries';
import { json } from '@/lib/server/http';

// Markets offered by the company form.
export const GET: APIRoute = () => json({ countries: countryOptions });
