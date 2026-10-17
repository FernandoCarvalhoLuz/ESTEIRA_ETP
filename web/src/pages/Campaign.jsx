import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/api.js';
import { DESTINATIONS, fmtBudget, fmtDate, fmtPct, OBJECTIVES, OPTIMIZATION_GOALS } from '../lib/format.js';
import { useLinkWithRange, useRange } from '../lib/range.js';
import { DELIVERY_KEYS, metricColumn, PERFORMANCE_KEYS, resultColumns } from '../lib/columns.jsx';
import { isTemplateCandidate } from '../../../shared/esteira.js';
import { DataTable, ExportButton, exportCsv } from '../components/DataTable.jsx';
import { ErrorState, LoadingState, PageControls, Segmented, Status, StatusToggle } from '../components/Common.jsx';
import { AudienceCards, AudienceFilters, EMPTY_FILTERS, matchesFilters } from '../components/AudiencePanel.jsx';
import { KpiGrid } from '../components/Kpis.jsx';
import { ResultsAnatomy, useBreakdowns } from '../components/Breakdowns.jsx';
import { TrafficFlow } from '../components/TrafficFlow.jsx';
import { DailyCharts } from '../components/Charts.jsx';
import { CreativeMatrix } from '../components/CreativeMatrix.jsx';
import { SaveTemplateModal } from '../components/SaveTemplateModal.jsx';
import { ExternalIcon, StarIcon } from '../components/Icons.jsx';

const relevant = (r) => r.delivered || r.effectiveStatus === 'ACTIVE';

export function Campaign() {
  const { campaignId } = useParams();
  const [params] = useSearchParams();
  const highlightAdset = params.get('conjunto');
  const { query } = useRange();
  const withRange = useLinkWithRange();
  const { data, error, loading, refresh } = useApi(`/api/meta/campaigns/${campaignId}?${query}`);
  const breakdown = useBreakdowns(campaignId);
  const [adsetFilter, setAdsetFilter] = useState('relevant');
  const [adFilter, setAdFilter] = useState('relevant');
  const [saving, setSaving] = useState(null);
  const [audFilters, setAudFilters] = useState(EMPTY_FILTERS);
  const filtering = Object.values(audFilters).some(Boolean);

  const currency = data?.account.currency || 'BRL';
  const metricCols = useMemo(() => [
    ...PERFORMANCE_KEYS.map((k) => metricColumn(k, { currency })),
    ...resultColumns(currency),
    ...DELIVERY_KEYS.map((k) => metricColumn(k, { currency, bar: false })),
  ], [currency]);

  const toggleColumn = (kind) => ({
    key: 'toggle',
    label: '',
    value: (r) => (r.status === 'ACTIVE' ? 1 : 0),
    csv: (r) => r.status || '',
    render: (r) => <StatusToggle id={r.id} status={r.status} kind={kind} onChanged={refresh} />,
  });

  const adsetColumns = useMemo(() => [
    toggleColumn('adset'),
    {
      key: 'name',
      label: 'Conjunto de anúncios',
      className: 'name',
      value: (r) => r.name,
      render: (r) => (
        <>
          <span className="row-name">{r.name}</span>
          <div className="row-meta">
            <Status value={r.effectiveStatus} />
            {r.optimizationGoal && <span>Otimização: {OPTIMIZATION_GOALS[r.optimizationGoal] || r.optimizationGoal}</span>}
            {DESTINATIONS[r.destinationType] && <span>{DESTINATIONS[r.destinationType]}</span>}
          </div>
        </>
      ),
    },
    { key: 'budget', label: 'Orçamento', num: true, value: (r) => r.budget?.daily ?? r.budget?.lifetime ?? null, csv: (r) => fmtBudget(r.budget, currency), render: (r) => fmtBudget(r.budget, currency) },
    ...metricCols,
  ], [currency, metricCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const adColumns = useMemo(() => [
    toggleColumn('ad'),
    {
      key: 'name',
      label: 'Anúncio',
      className: 'name',
      value: (r) => r.name,
      render: (r) => (
        <div className="ad-cell">
          {r.thumbnail ? <img className="thumb" src={r.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="thumb" aria-hidden="true" />}
          <div>
            <span className="row-name">{r.name}</span>
            <div className="row-meta"><Status value={r.effectiveStatus} />{r.adsetName && <span>{r.adsetName}</span>}</div>
          </div>
        </div>
      ),
    },
    ...metricCols,
  ], [metricCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const adsets = useMemo(() => (data ? data.adsets.filter((r) => (adsetFilter === 'all' || relevant(r) || r.id === highlightAdset) && matchesFilters(r, audFilters)) : []), [data, adsetFilter, highlightAdset, audFilters]);
  const adsetIds = useMemo(() => new Set(adsets.map((a) => a.id)), [adsets]);
  const ads = useMemo(() => (data ? data.ads.filter((r) => (adFilter === 'all' || relevant(r)) && (!filtering || adsetIds.has(r.adsetId))) : []), [data, adFilter, filtering, adsetIds]);

  const c = data?.campaign;
  const accountAvg = data?.accountCurrent?.costPerConversation;
  const vsAccount = accountAvg && data?.current?.costPerConversation ? (data.current.costPerConversation / accountAvg - 1) * 100 : null;
  const candidate = data && isTemplateCandidate(data.current, data.accountCurrent);
  const openSave = () => setSaving({ id: c.id, name: c.name, metrics: data.current, currency, accountName: data.account.name, range: data.range });

  const head = (
    <div className="page-head">
      <div>
        <div className="breadcrumb">
          <Link to={withRange('/')}>Visão geral</Link><span>›</span>
          {data ? <Link to={withRange(`/conta/${data.account.id}`)}>{data.account.name}</Link> : <span>Conta</span>}
          <span>›</span><span>Campanha</span>
        </div>
        <h1>{c?.name || 'Carregando…'}</h1>
        {c && (
          <div className="page-sub">
            <StatusToggle id={c.id} status={c.status} kind="campaign" onChanged={refresh} />
            <Status value={c.effectiveStatus} />
            {c.objective && <span>{OBJECTIVES[c.objective] || c.objective}</span>}
            <span>Orçamento: {fmtBudget(c.budget, currency)}{c.budget?.source === 'adsets' ? ' (conjuntos ativos)' : ''}</span>
            {c.startTime && <span>Início: {fmtDate(c.startTime.slice(0, 10))}</span>}
            {vsAccount != null && (
              <span className={`tag ${vsAccount <= 0 ? 'good' : 'critical'}`}>
                Custo/conversa {fmtPct(Math.abs(vsAccount), 0)} {vsAccount <= 0 ? 'abaixo' : 'acima'} da média da conta
              </span>
            )}
          </div>
        )}
      </div>
      <PageControls data={data} loading={loading} onRefresh={refresh}>
        {c && (
          <>
            <a className="btn" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${data.account.id.replace('act_', '')}&selected_campaign_ids=${c.id}`} target="_blank" rel="noreferrer">
              <ExternalIcon /> Gerenciador
            </a>
            <button type="button" className={`btn ${candidate ? 'btn-primary' : ''}`} onClick={openSave}>
              <StarIcon filled={candidate} /> Salvar como modelo
            </button>
          </>
        )}
      </PageControls>
    </div>
  );

  if (error && !data) return <>{head}<ErrorState error={error} onRetry={refresh} /></>;
  if (!data) return <>{head}<LoadingState /></>;

  const fileBase = `${c.name}-${data.range.since}-a-${data.range.until}`;

  return (
    <>
      {head}
      {error && <div className="notice critical" style={{ marginBottom: 16 }}>{error.message}</div>}
      <div className={loading ? 'loading-dim' : undefined}>
        <KpiGrid current={data.current} previous={data.previous} currency={currency} daily={data.daily} />

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Evolução diária</h2>
              <p>Passe o mouse sobre um dia para ver os três valores. A linha cinza é o período anterior.</p>
            </div>
          </div>
          <DailyCharts daily={data.daily} previousDaily={data.previousDaily} totals={data.current} currency={currency} />
        </section>

        <ResultsAnatomy breakdown={breakdown} metrics={data.current} currency={currency} />


        <section className="section">
          <div className="section-head">
            <div>
              <h2>Melhor conjunto por anúncio</h2>
              <p>Custo por conversa de cada criativo em cada conjunto (público). O destaque verde é onde o anúncio rende melhor.</p>
            </div>
          </div>
          <CreativeMatrix ads={data.ads} adsets={data.adsets} currency={currency} />
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Público dos conjuntos</h2>
              <p>Localização, idade, interesses, dispositivos e públicos personalizados de cada conjunto. Os filtros valem também para as tabelas abaixo.</p>
            </div>
            <Segmented options={[['relevant', 'Veicularam ou ativos'], ['all', 'Todos']]} value={adsetFilter} onChange={setAdsetFilter} label="Filtrar conjuntos" />
          </div>
          <AudienceFilters adsets={data.adsets.filter((r) => adsetFilter === 'all' || relevant(r) || r.id === highlightAdset)} filters={audFilters} onChange={setAudFilters} />
          <AudienceCards adsets={adsets} currency={currency} onStatusChanged={refresh} highlight={highlightAdset} />
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Conjuntos de anúncios</h2>
              <p>{adsets.length} conjunto(s){filtering ? ' com os filtros de público' : ''}</p>
            </div>
            <div className="table-tools">
              <Segmented options={[['relevant', 'Veicularam ou ativos'], ['all', 'Todos']]} value={adsetFilter} onChange={setAdsetFilter} label="Filtrar conjuntos" />
              <ExportButton onClick={() => exportCsv(`conjuntos-${fileBase}.csv`, adsetColumns, adsets)} />
            </div>
          </div>
          <div className="card">
            <DataTable columns={adsetColumns} rows={adsets} defaultSort={{ key: 'spend', dir: 'desc' }} highlight={highlightAdset} empty="Nenhum conjunto com esse filtro." />
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h2>Anúncios</h2>
              <p>{ads.length} anúncio(s){filtering ? ' nos conjuntos filtrados' : ''}</p>
            </div>
            <div className="table-tools">
              <Segmented options={[['relevant', 'Veicularam ou ativos'], ['all', 'Todos']]} value={adFilter} onChange={setAdFilter} label="Filtrar anúncios" />
              <ExportButton onClick={() => exportCsv(`anuncios-${fileBase}.csv`, adColumns, ads)} />
            </div>
          </div>
          <div className="card">
            <DataTable columns={adColumns} rows={ads} defaultSort={{ key: 'spend', dir: 'desc' }} empty="Nenhum anúncio com esse filtro." />
          </div>
        </section>
      </div>
      <SaveTemplateModal campaign={saving} onClose={() => setSaving(null)} />
    </>
  );
}
