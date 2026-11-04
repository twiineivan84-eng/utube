import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config';
import { serverStore } from './src/server/storage/serverStore';
import { SeedService } from './src/server/services/seedService';
import { authRouter } from './src/server/routes/authRoutes';
import { branchRouter } from './src/server/routes/branchRoutes';
import { auditRouter } from './src/server/routes/auditRoutes';
import { userRouter } from './src/server/routes/userRoutes';
import { syncRouter } from './src/server/routes/syncRoutes';
import { memberRouter } from './src/server/routes/memberRoutes';
import { turihamweRouter } from './src/server/routes/turihamweRoutes';
import { claimRouter } from './src/server/routes/claimRoutes';
import { smsRouter } from './src/server/routes/smsRoutes';
import { alertRouter } from './src/server/routes/alertRoutes';
import { reportRouter } from './src/server/routes/reportRoutes';
import { systemRouter } from './src/server/routes/systemRoutes';
import { smsQueueWorker } from './src/server/services/smsQueueWorker';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = config.app.port;
const isProd = config.app.isProduction;

async function bootstrap() {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: `${config.storage.maxUploadSizeMb}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.storage.maxUploadSizeMb}mb` }));

  // CORS middleware (Requirement 12)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = config.app.corsAllowedOrigins;

    if (config.app.isDevelopment || !origin) {
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowed.includes(origin) || allowed.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Security: Protect internal database, backups, and confidential storage from public web access
  app.use(['/data', '/data/*'], (_req, res) => {
    res.status(403).json({ error: 'Access forbidden: internal data repositories are protected from public web access.' });
  });

  // Initialize persistence and database seed
  await serverStore.initialize();
  await SeedService.seedInitialData();

  // Start background Africa's Talking SMS Queue Worker
  smsQueueWorker.start();

  // Mount API endpoints
  app.use('/api/auth', authRouter);
  app.use('/api/branches', branchRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/users', userRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/members', memberRouter);
  app.use('/api/turihamwe', turihamweRouter);
  app.use('/api/claims', claimRouter);
  app.use('/api/sms', smsRouter);
  app.use('/api/alerts', alertRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api/system', systemRouter);

  // Production Health Check & Monitoring (Requirement 7 & 15)
  app.get('/api/health', (_req, res) => {
    const branches = serverStore.getBranches();
    const members = serverStore.getMembers();
    const users = serverStore.getUsers();
    const syncRecords = serverStore.getSyncRecords();
    const pendingSync = syncRecords.filter(r => r.status === 'PENDING').length;
    const smsMessages = serverStore.getSmsMessages();

    res.json({
      status: 'ONLINE',
      system: 'Turihamwe Management System',
      organization: 'Nyamuyanja SACCO Ltd, Uganda',
      version: '1.0.0-phase9',
      environment: config.app.nodeEnv,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      components: {
        database: {
          status: 'HEALTHY',
          mode: config.database.databaseUrl ? 'PostgreSQL_Central_Storage' : 'Local_Transactional_Journal',
          branchesCount: branches.length,
          usersCount: users.length,
          membersCount: members.length,
        },
        sqliteOffline: {
          status: 'READY',
          path: config.database.sqlitePath,
          pendingSyncCount: pendingSync,
        },
        storage: {
          status: 'ONLINE',
          maxUploadSizeMb: config.storage.maxUploadSizeMb,
        },
        sms: {
          status: config.sms.enabled ? (config.sms.environment === 'PRODUCTION' ? 'LIVE_GATEWAY' : 'SANDBOX_MODE') : 'DISABLED',
          provider: "Africa's Talking",
          environment: config.sms.environment,
          senderId: config.sms.senderId,
          workerStatus: smsQueueWorker.getStatus(),
          configurationStatus: smsQueueWorker.getDiagnostics().configurationStatus,
          pendingMessages: smsMessages.filter(m => m.status === 'PENDING').length,
          sentMessages: smsMessages.filter(m => m.status === 'SENT').length,
          failedMessages: smsMessages.filter(m => m.status === 'FAILED').length,
        },
        backup: {
          enabled: config.backup.enabled,
          storageConfigured: true,
        },
        sync: {
          enabled: config.sync.enabled,
          intervalSeconds: config.sync.intervalSeconds,
        },
      },
    });
  });

  // Frontend integration
  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        allowedHosts: true,
        hmr: isHmrDisabled ? false : undefined,
        ws: (isHmrDisabled ? false : undefined) as false | undefined,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TURIHAMWE SACCO] Server online on http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log('[TURIHAMWE SACCO] Server shutting down, terminating background workers...');
    smsQueueWorker.stop();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

bootstrap().catch(err => {
  console.error('[FATAL] Failed to bootstrap Turihamwe Management System:', err);
  process.exit(1);
});
