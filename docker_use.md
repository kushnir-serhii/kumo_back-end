First-time setup:


npm run docker:up          # start local Postgres container
npm run dev:local          # run app against local DB
npm run db:local:migrate   # apply schema migrations to local DB

Exite Docker: 
npm run docker:stop        # The typical clean shutdown 

npm run docker:down        # clean container next time still keep yourdata 

Useful day-to-day commands:

Command	What it does
npm run docker:up	    Start container (detached)
npm run dev:local	    Run app with local DB


npm run db:local:studio	Open Prisma Studio on local DB
npm run db:local:reset	Wipe and re-migrate local DB
npm run docker:reset	Destroy volume + fresh container
