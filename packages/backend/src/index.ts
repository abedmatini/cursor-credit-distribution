import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import guestsRouter from './routes/guests';
import vouchersRouter from './routes/vouchers';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/guests', guestsRouter);
app.use('/api/vouchers', vouchersRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Cursor Credit Distribution API listening on http://localhost:${PORT}`);
});
