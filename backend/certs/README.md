# Public Supabase database CA

Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The URL is supplied by the official Supabase Studio ssl:certificate_url production configuration. Verified October13,2026. PEM SHA256:700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7. Certificate expires April26,2031. This is public trust material, not a credential. Replace only after verifying an authentic provider certificate and updating the integrity pin.

Runtime pg uses explicit scoped CA with certificate and hostname validation, removing competing URL TLS settings first. Prisma uses the same file through sslcert, sslmode=require and sslaccept=strict. Paths work from src/db and dist/db; backend/certs remains present in repository deployments. Neither modifies operating-system trust. Local isolated non-Supabase databases retain their existing settings.

Official references: https://supabase.com/docs/guides/platform/ssl-enforcement and https://www.prisma.io/docs/orm/v6/overview/databases/postgresql .
