import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useApi } from '../lib/api.js';
import { fmtPct, fmtRange, percentChange } from '../lib/format.js';
import { useLinkWithRange, useRange } from '../lib/range.js';
import { metricColumn } from '../lib/columns.jsx';
import { stagger } from '../lib/motion.js';
import { DataTable, ExportButton, exportCsv } from '../components/DataTable.jsx';
import { ErrorState, LoadingState, PageControls, Segmented } from '../components/Common.jsx';
import { KpiGrid, Sparkline } from '../components/Kpis.jsx';
import { AccountRanking, Insights } from '../components/Ranking.jsx';
import { ArrowIcon } from '../components/Icons.jsx';
import { ResultsAnatomy, useBreakdowns } from '../components/Breakdowns.jsx';
import { TrafficFlow } from '../components/TrafficFlow.jsx';
import { MetricTicker } from '../components/Decor.jsx';


function CostChange({ account }) {
  const change = percentChange(account.current?.costPerConversation, account.previous?.costPerConversation);
  if (change == null) return '—';
  const dir = change >= 0 ? 'up' : 'down';
  const tone = Math.abs(change) < 0.5 ? '' : dir === 'down' ? 'good' : 'bad';
  return <span className={`delta ${tone}`}><span className="pill"><ArrowIcon dir={dir} />{fmtPct(Math.abs(change), 1)}</span></span>;
}

function Head({ data, loading, refresh }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">Todas as contas</div>
        <h1><span className="grad">Visão geral</span></h1>
        {data && <div className="page-sub">{data.totals.deliveringCount} de {data.accounts.length} contas veiculando · {fmtRange(data.range)}</div>}
      </div>
      <PageControls data={data} loading={loading} onRefresh={refresh} />
    </div>
  );
}

export function Overview() {
  const { query } = useRange();
  const withRange = useLinkWithRange();
  const navigate = useNavigate();
  const { data, error, loading, refresh } = useApi(`/api/meta/accounts?${query}`);
  const [filter, setFilter] = useState('delivering');
  const breakdown = useBreakdowns('all');
  const currency = data?.totals.currency || 'BRL';

  const rows = useMemo(() => {
    if (!data) return [];
    return data.accounts
      .filter((a) => (filter === 'all' ? true : a.error || a.current?.spend > 0 || a.current?.impressions > 0))
      .map((a) => ({ ...a, metrics: a.current }));
  }, [data, filter]);

  const columns = useMemo(() => [
    {
      key: 'name',
      label: 'Conta',
      className: 'name',
      value: (r) => r.name,
      render: (r) => (
        <>
          <Link className="row-name" to={withRange(`/conta/${r.id}`)}>{r.name}</Link>
          <div className="row-meta">
            {r.status !== 1 && <span className="tag warning">{r.statusLabel}</span>}
            {r.currency !== currency && <span className="tag">{r.currency}</span>}
            {r.error && <span className="tag critical">Erro: {r.error}</span>}
          </div>
        </>
      ),
    },
    {
      key: 'trend',
      label: 'Tendência',
      title: 'Investimento diário no período',
      value: (r) => r.current?.spend ?? null,
      csv: () => '',
      render: (r) => (r.daily?.length > 1 ? <Sparkline values={r.daily.map((d) => d.spend)} className="spark" /> : '—'),
    },
    metricColumn('spend', { currency }),
    metricColumn('conversations'),
    metricColumn('costPerConversation', { currency }),
    {
      key: 'costChange',
      label: 'Δ custo/conv.',
      num: true,
      title: 'Variação do custo por conversa em relação ao período anterior',
      value: (r) => percentChange(r.current?.costPerConversation, r.previous?.costPerConversation),
      render: (r) => <CostChange account={r} />,
    },
    metricColumn('firstReplies'),
    metricColumn('costPerFirstReply', { currency }),
    metricColumn('impressions', { bar: false }),
    metricColumn('cpm', { currency }),
    metricColumn('linkClicks'),
    metricColumn('linkCtr'),
    metricColumn('cpcLink', { currency }),
    metricColumn('clickToConversation'),
    metricColumn('leads'),
  ], [currency, withRange]);

  if (error && !data) return <><Head data={data} loading={loading} refresh={refresh} /><ErrorState error={error} onRetry={refresh} /></>;
  if (!data) return <><Head data={data} loading={loading} refresh={refresh} /><LoadingState /></>;

  const totals = data.totals;
  const linkTo = (id) => withRange(`/conta/${id}`);

  return (
    <>
      <Head data={data} loading={loading} refresh={refresh} />
      <MetricTicker accounts={data.accounts} currency={currency} linkTo={linkTo} />
      {error && <div className="notice critical" style={{ marginBottom: 16 }}>{error.message}</div>}
      <div className={loading ? 'loading-dim' : undefined}>
        <KpiGrid current={totals.current} previous={totals.previous} currency={currency} includeReach={false} daily={totals.daily} />
        {totals.otherCurrencies.length > 0 && (
          <div className="notice" style={{ marginTop: 12 }}>
            Os totais consideram apenas contas em {currency}. Contas em {totals.otherCurrencies.join(', ')} aparecem só na tabela.
          </div>
        )}

        <TrafficFlow metrics={totals.current} breakdown={breakdown.data} currency={currency} />

        <section className="section">
          <motion.div className="grid-2-1" variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }}>
            <AccountRanking accounts={data.accounts.filter((a) => a.currency === currency)} currency={currency} linkTo={linkTo} />
            <Insights accounts={data.accounts} totals={totals} currency={currency} linkTo={linkTo} />
          </motion.div>
        </section>

        <ResultsAnatomy breakdown={breakdown} metrics={totals.current} currency={currency} />

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Contas de anúncio</h2>
              <p>Clique em uma conta para ver campanhas, gráficos diários e criativos.</p>
            </div>
            <div className="table-tools">
              <Segmented options={[['delivering', 'Com veiculação'], ['all', 'Todas']]} value={filter} onChange={setFilter} label="Filtrar contas" />
              <ExportButton onClick={() => exportCsv(`contas-${data.range.since}-a-${data.range.until}.csv`, columns.filter((c) => c.key !== 'trend'), rows)} />
            </div>
          </div>
          <div className="card">
            <DataTable
              columns={columns}
              rows={rows}
              defaultSort={{ key: 'spend', dir: 'desc' }}
              footer={{ label: `Total (${totals.accountsCount} contas em ${currency})`, metrics: totals.current }}
              onRowClick={(r) => navigate(linkTo(r.id))}
              empty="Nenhuma conta veiculou no período."
            />
          </div>
        </section>
      </div>
    </>
  );
}
