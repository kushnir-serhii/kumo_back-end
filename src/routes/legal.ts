import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

const langs = ['en', 'pl', 'ua'] as const;
type Lang = (typeof langs)[number];

const docsDir = path.join(__dirname, '../docs');

const privacyFiles: Record<Lang, string> = {
  en: fs.readFileSync(path.join(docsDir, 'privacy-policy.html'), 'utf-8'),
  pl: fs.readFileSync(path.join(docsDir, 'privacy-policy.pl.html'), 'utf-8'),
  ua: fs.readFileSync(path.join(docsDir, 'privacy-policy.ua.html'), 'utf-8'),
};

const termsFiles: Record<Lang, string> = {
  en: fs.readFileSync(path.join(docsDir, 'terms-of-service.html'), 'utf-8'),
  pl: fs.readFileSync(path.join(docsDir, 'terms-of-service.pl.html'), 'utf-8'),
  ua: fs.readFileSync(path.join(docsDir, 'terms-of-service.ua.html'), 'utf-8'),
};

const getLang = (query: Record<string, string | undefined>): Lang => {
  const lang = query.lang;
  return langs.includes(lang as Lang) ? (lang as Lang) : 'en';
};

export default async function legalRoutes(fastify: FastifyInstance) {
  fastify.get('/privacy-policy', {
    config: { rateLimit: false },
  }, async (request, reply) => {
    const lang = getLang(request.query as Record<string, string | undefined>);
    reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'public, max-age=86400')
      .send(privacyFiles[lang]);
  });

  fastify.get('/terms', {
    config: { rateLimit: false },
  }, async (request, reply) => {
    const lang = getLang(request.query as Record<string, string | undefined>);
    reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .header('Cache-Control', 'public, max-age=86400')
      .send(termsFiles[lang]);
  });
}
