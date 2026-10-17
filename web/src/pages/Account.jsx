import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { fmtBudget, fmtMoney, OBJECTIVES } from '../lib/format.js';
import { useLinkWithRange, useRange } from '../lib/range.js';
import { DELIVERY_KEYS, metricColumn, PERFORMANCE_KEYS, resultColumns } from '../lib/columns.jsx';
import { isTemplateCandidate } from '../../../shared/esteira.js';
import { DataTable, ExportButton, exportCsv } from '../components/DataTable.jsx';
import { ErrorState, LoadingState, PageControls, Segmented, Status, StatusToggle } from '../components/Common.jsx';
import { KpiGrid } from '../components/Kpis.jsx';
import { ResultsAnatomy, useBreakdowns } from '../components/Breakdowns.jsx';
import { TrafficFlow } from '../components/TrafficFlow.jsx';
import { DailyCharts } from '../components/Charts.jsx';
import { SaveTemplateModal } from '../components/SaveTemplateModal.jsx';
import { ConveyorIcon, StarIcon } from '../components/Icons.jsx';

const FILTERS = [
  ['relevant', 'Veicularam ou ativas'],
  ['active', 'Ativas'],
  ['candidates', 'Candidatas a modelo'],
  ['all', 'Todas'],
];

export function Account() {
  const { accountId } = useParams();
  const { query } = useRange();
  const withRange = useLinkWithRange();
  const navigate = useNavigate();
  const { data, error, loading, refresh } = useApi(`/api/meta/accounts/${accountId}?${query}`);
  const breakdown = useBreakdowns(accountId);
  const [filter, setFilter] = useState('relevant');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);

  const currency = data?.account.currency || 'BRL';
  const isCandidate = (c) => (data ? isTemplateCandidate(c.metrics, data.current) : false);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.campaigns.filter((c) => {
      if (filter === 'active' && c.effectiveStatus !== 'ACTIVE') return false;
      if (filter === 'relevant' && !(c.delivered || c.effectiveStatus === 'ACTIVE')) return false;
      if (filter === 'candidates' && !isTemplateCandidate(c.metrics, data.current)) return false;
      return !term || c.name.toLowerCase().includes(term);
    });
  }, [data, filter, search]);

  const columns = useMemo(() => [
    {
      key: 'toggle',
      label: '',
      value: (r) => (r.status === 'ACTIVE' ? 1 : 0),
      csv: (r) => r.status || '',
      render: (r) => <StatusToggle id={r.id} status={r.status} kind="campaign" onChanged={refresh} />,
    },
    {
      key: 'name',
      label: 'Campanha',
      className: 'name',
      value: (r) => r.name,
      render: (r) => (
        <>
          <Link className="row-name" to={withRange(`/campanha/${r.id}`)}>{r.name}</Link>
          <div className="row-meta">
            <Status value={r.effectiveStatus} />
            {r.objective && <span>{OBJECTIVES[r.objective] || r.objective}</span>}
            {data && isTemplateCandidate(r.metrics, data.current) && (
              <button
                type="button"
                className="tag accent"
                style={{ cursor: 'pointer' }}
                title="Custo por conversa bem abaixo da média da conta — salve como modelo"
                onClick={() => setSaving({ id: r.id, name: r.name, metrics: r.metrics, currency, accountName: data.account.name, range: data.range })}
              >
                <StarIcon /> Candidata a modelo
              </button>
            )}
          </div>
        </>
      ),
    },
    {
      key: 'budget',
      label: 'Orçamento',
      num: true,
      value: (r) => r.budget?.daily ?? r.budget?.lifetime ?? null,
      csv: (r) => fmtBudget(r.budget, currency),
      render: (r) => (
        <>
          {fmtBudget(r.budget, currency)}
          {r.budget?.source === 'adsets' && <span className="cell-sub">nos conjuntos ativos</span>}
        </>
      ),
    },
    ...PERFORMANCE_KEYS.map((k) => metricColumn(k, { currency })),
    ...resultColumns(currency),
    ...DELIVERY_KEYS.map((k) => metricColumn(k, { currency, bar: false })),
    {
      key: 'actions',
      label: '',
      value: () => null,
      csv: () => '',
      render: (r) => (
        <button type="button" className="btn btn-ghost btn-sm" title="Salvar como modelo" onClick={() => setSaving({ id: r.id, name: r.name, metrics: r.metrics, currency, accountName: data?.account.name, range: data?.range })}>
          <StarIcon filled={false} />
        </button>
      ),
    },
  ], [currency, withRange, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const candidates = data ? data.campaigns.filter((c) => isCandidate(c)).length : 0;

  const head = (
    <div className="page-head">
      <div>
        <div className="breadcrumb"><Link to={withRange('/')}>Visão geral</Link><span>›</span><span>Conta</span></div>
        <h1>{data?.account.name || 'Carregando…'}</h1>
        {data && (
          <div className="page-sub">
            <Status value={data.account.status === 1 ? 'ACTIVE' : 'PAUSED'} label={data.account.statusLabel} />
            <span className="mono">{data.account.id.replace('act_', 'ID ')}</span>
            {data.account.amountSpent != null && <span>Total investido na conta: {fmtMoney(data.account.amountSpent, currency)}</span>}
          </div>
        )}
      </div>
      <PageControls data={data} loading={loading} onRefresh={refresh}>
        <button type="button" className="btn" onClick={() => navigate(`/esteira?nova=1&conta=${accountId}`)}>
          <ConveyorIcon /> Nova campanha nesta conta
        </button>
      </PageControls>
    </div>
  );

  if (error && !data) return <>{head}<ErrorState error={error} onRetry={refresh} /></>;
  if (!data) return <>{head}<LoadingState /></>;

  return (
    <>
      {head}
      {error && <div className="notice critical" style={{ marginBottom: 16 }}>{error.message}</div>}
      <div className={loading ? 'loading-dim' : undefined}>
        <KpiGrid current={data.current} previous={data.previous} currency={currency} daily={data.daily} />

        <TrafficFlow metrics={data.current} breakdown={breakdown.data} currency={currency} />

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Evolução diária</h2>
              <p>Passe o mouse sobre um dia para ver os três valores. A linha cinza é o período anterior.</p>
            </div>
          </div>
          <DailyCharts daily={data.daily} previousDaily={data.previousDaily} totals={data.current} currency={currency} />
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Campanhas {candidates > 0 && <span className="tag accent"><StarIcon /> {candidates} candidata(s) a modelo</span>}</h2>
              <p>{rows.length} campanha(s) · {data.campaigns.filter((c) => c.delivered).length} veicularam no período</p>
            </div>
            <div className="table-tools">
              <input className="field" type="search" placeholder="Buscar campanha" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar campanha" />
              <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filtrar campanhas" />
              <ExportButton onClick={() => exportCsv(`campanhas-${data.account.name}-${data.range.since}-a-${data.range.until}.csv`, columns.filter((c) => c.key !== 'actions' && c.key !== 'toggle'), rows)} />
            </div>
          </div>
          <div className="card">
            <DataTable
              columns={columns}
              rows={rows}
              defaultSort={{ key: 'spend', dir: 'desc' }}
              footer={{ label: 'Total da conta', metrics: data.current }}
              onRowClick={(r) => navigate(withRange(`/campanha/${r.id}`))}
              empty="Nenhuma campanha encontrada com esse filtro."
            />
          </div>
        </section>

        <ResultsAnatomy breakdown={breakdown} metrics={data.current} currency={currency} />
      </div>
      <SaveTemplateModal campaign={saving} onClose={() => setSaving(null)} />
    </>
  );
}
