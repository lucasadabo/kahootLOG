import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Download, Upload, Trash2, CheckSquare, Square,
  ChevronLeft, ChevronRight, FileSpreadsheet, AlertCircle,
  CheckCircle2, Loader2, Search, Plus, ArrowUp, ArrowDown, ArrowUpDown, X
} from "lucide-react";
import * as XLSX from "xlsx";
import { gameSupabase } from "@/lib/gameSupabase";

interface Pergunta {
  id: string;
  pergunta: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  correta: string;
  categoria?: string;
  dificuldade?: string;
}

type EditingCell = { id: string; field: keyof Pergunta } | null;
type SaveStatus = { id: string; field: keyof Pergunta; status: "saving" | "saved" | "error" } | null;
type SortField = keyof Pergunta | null;
type SortDir = "asc" | "desc";

interface NewRow {
  pergunta: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  correta: string;
  categoria: string;
  dificuldade: string;
}

const PAGE_SIZE = 100;

const COLUMNS: { field: keyof Pergunta; label: string; minWidth: string }[] = [
  { field: "pergunta",      label: "Pergunta",    minWidth: "min-w-[300px]" },
  { field: "alternativa_a", label: "A",           minWidth: "min-w-[160px]" },
  { field: "alternativa_b", label: "B",           minWidth: "min-w-[160px]" },
  { field: "alternativa_c", label: "C",           minWidth: "min-w-[160px]" },
  { field: "alternativa_d", label: "D",           minWidth: "min-w-[160px]" },
  { field: "correta",       label: "Correta",     minWidth: "w-20" },
  { field: "categoria",     label: "Categoria",   minWidth: "min-w-[120px]" },
  { field: "dificuldade",   label: "Dificuldade", minWidth: "min-w-[100px]" },
];

const EMPTY_NEW_ROW: NewRow = {
  pergunta: "", alternativa_a: "", alternativa_b: "", alternativa_c: "",
  alternativa_d: "", correta: "", categoria: "", dificuldade: "",
};

const ADMIN_PASSWORD = "teste123";

export default function Perguntas() {
  const navigate = useNavigate();

  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline editing
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);
  const saveStatusTimerRef = useRef<number | null>(null);

  // Search, sort & category filter — server-side
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState(""); // debounce buffer
  const [sortField, setSortField] = useState<SortField>("categoria");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // New row
  const [showNewRow, setShowNewRow] = useState(false);
  const [newRow, setNewRow] = useState<NewRow>(EMPTY_NEW_ROW);
  const [savingNewRow, setSavingNewRow] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Debounce search input
  useEffect(() => {
    const t = window.setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Fetch all categories once (for the dropdown)
  const fetchCategories = useCallback(async () => {
    const { data } = await gameSupabase.from("perguntas").select("categoria");
    if (data) {
      const cats = [...new Set(data.map((r: any) => r.categoria ?? "").filter(Boolean))].sort();
      setAvailableCategories(cats as string[]);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const fetchPerguntas = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = gameSupabase
        .from("perguntas")
        .select("*", { count: "exact" });

      if (categoryFilter) {
        query = query.eq("categoria", categoryFilter);
      }

      if (search.trim()) {
        // Supabase ilike for text search across pergunta field
        query = query.ilike("pergunta", `%${search.trim()}%`);
      }

      if (sortField) {
        query = query.order(sortField as string, { ascending: sortDir === "asc" });
      }

      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      setPerguntas(data ?? []);
      setTotal(count ?? 0);
      setSelected(new Set());
    } catch {
      showToast("error", "Erro ao carregar perguntas.");
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, sortField, sortDir]);

  useEffect(() => { fetchPerguntas(); }, [fetchPerguntas]);

  // displayedPerguntas is now just the server-filtered list
  const displayedPerguntas = perguntas;

  const handleSort = (field: keyof Pergunta) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  };

  const SortIcon = ({ field }: { field: keyof Pergunta }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3 h-3 text-primary" />
      : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  // --- Inline editing ---
  const startEdit = (p: Pergunta, field: keyof Pergunta) => {
    setEditingCell({ id: p.id, field });
    setEditValue(String(p[field] ?? ""));
  };

  const cancelEdit = () => { setEditingCell(null); setEditValue(""); };

  const commitEdit = async (id: string, field: keyof Pergunta, value: string) => {
    const trimmed = field === "correta" ? value.trim().toUpperCase() : value.trim();
    setPerguntas((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: trimmed } : p)));
    setEditingCell(null);
    setSaveStatus({ id, field, status: "saving" });
    if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    try {
      const { error } = await gameSupabase.from("perguntas").update({ [field]: trimmed }).eq("id", id);
      if (error) throw error;
      setSaveStatus({ id, field, status: "saved" });
      saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus({ id, field, status: "error" });
      saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus(null), 3000);
      showToast("error", "Erro ao salvar alteração.");
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, id: string, field: keyof Pergunta) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(id, field, editValue); }
    if (e.key === "Escape") cancelEdit();
  };

  // --- New row ---
  const handleSaveNewRow = async () => {
    if (!newRow.pergunta || !newRow.alternativa_a || !newRow.alternativa_b ||
        !newRow.alternativa_c || !newRow.alternativa_d || !newRow.correta) {
      showToast("error", "Preencha pelo menos: Pergunta, alternativas A-D e Correta.");
      return;
    }
    setSavingNewRow(true);
    try {
      const { error } = await gameSupabase.from("perguntas").insert({
        pergunta: newRow.pergunta.trim(),
        alternativa_a: newRow.alternativa_a.trim(),
        alternativa_b: newRow.alternativa_b.trim(),
        alternativa_c: newRow.alternativa_c.trim(),
        alternativa_d: newRow.alternativa_d.trim(),
        correta: newRow.correta.trim().toUpperCase(),
        categoria: newRow.categoria.trim() || null,
        dificuldade: newRow.dificuldade.trim() || null,
      });
      if (error) throw error;
      showToast("success", "Pergunta adicionada com sucesso!");
      setShowNewRow(false);
      setNewRow(EMPTY_NEW_ROW);
      fetchPerguntas();
    } catch {
      showToast("error", "Erro ao adicionar pergunta.");
    } finally {
      setSavingNewRow(false);
    }
  };

  // --- Upload ---
  const handleDownloadTemplate = () => {
    const headers = [["pergunta","alternativa_a","alternativa_b","alternativa_c","alternativa_d","correta","categoria","dificuldade"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws["!cols"] = [{ wch: 60 },{ wch: 30 },{ wch: 30 },{ wch: 30 },{ wch: 30 },{ wch: 10 },{ wch: 20 },{ wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Perguntas");
    XLSX.writeFile(wb, "modelo_perguntas.xlsx");
  };

  const processFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("error", "Apenas arquivos .xlsx ou .xls são aceitos."); return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);
      if (rows.length === 0) { showToast("error", "Planilha vazia."); return; }
      const inserts = rows
        .filter((r) => r.pergunta && r.alternativa_a && r.alternativa_b && r.alternativa_c && r.alternativa_d && r.correta)
        .map((r) => ({
          pergunta: String(r.pergunta).trim(),
          alternativa_a: String(r.alternativa_a).trim(),
          alternativa_b: String(r.alternativa_b).trim(),
          alternativa_c: String(r.alternativa_c).trim(),
          alternativa_d: String(r.alternativa_d).trim(),
          correta: String(r.correta).trim().toUpperCase(),
          categoria: r.categoria ? String(r.categoria).trim() : null,
          dificuldade: r.dificuldade ? String(r.dificuldade).trim() : null,
        }));
      if (inserts.length === 0) { showToast("error", "Nenhuma linha válida. Verifique os títulos das colunas."); return; }
      const { error } = await gameSupabase.from("perguntas").insert(inserts);
      if (error) throw error;
      showToast("success", `${inserts.length} pergunta(s) inserida(s)!`);
      setPage(0); fetchPerguntas();
    } catch { showToast("error", "Erro ao processar o arquivo."); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) processFile(file);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0]; if (file) processFile(file);
  };

  // --- Selection ---
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    if (selected.size === displayedPerguntas.length) setSelected(new Set());
    else setSelected(new Set(displayedPerguntas.map((p) => p.id)));
  };
  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Deletar ${selected.size} pergunta(s)? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const { error } = await gameSupabase.from("perguntas").delete().in("id", Array.from(selected));
      if (error) throw error;
      showToast("success", `${selected.size} pergunta(s) deletada(s).`);
      setPage(0); fetchPerguntas(); fetchCategories();
    } catch { showToast("error", "Erro ao deletar perguntas."); }
    finally { setDeleting(false); }
  };

  const handleDeleteByCategory = async () => {
    if (!categoryFilter) return;
    const count = displayedPerguntas.length;
    if (!window.confirm(`Deletar todas as ${count} perguntas da categoria "${categoryFilter}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      const { error } = await gameSupabase.from("perguntas").delete().eq("categoria", categoryFilter);
      if (error) throw error;
      showToast("success", `${count} pergunta(s) da categoria "${categoryFilter}" deletada(s).`);
      setCategoryFilter("");
      setPage(0);
      fetchPerguntas();
      fetchCategories();
    } catch {
      showToast("error", "Erro ao deletar perguntas.");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = displayedPerguntas.length > 0 && selected.size === displayedPerguntas.length;

  const renderCell = (p: Pergunta, field: keyof Pergunta) => {
    const isEditing = editingCell?.id === p.id && editingCell?.field === field;
    const isSaving = saveStatus?.id === p.id && saveStatus?.field === field && saveStatus.status === "saving";
    const isSaved  = saveStatus?.id === p.id && saveStatus?.field === field && saveStatus.status === "saved";
    const isError  = saveStatus?.id === p.id && saveStatus?.field === field && saveStatus.status === "error";
    const isShort  = field === "correta" || field === "dificuldade";

    if (isEditing) return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {isShort ? (
          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit(p.id, field, editValue)}
            onKeyDown={(e) => handleCellKeyDown(e, p.id, field)}
            className="w-full min-w-[60px] px-2 py-1 rounded-lg bg-background border-2 border-primary text-foreground font-body text-sm focus:outline-none uppercase"
            maxLength={field === "correta" ? 1 : 20} />
        ) : (
          <textarea autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => commitEdit(p.id, field, editValue)}
            onKeyDown={(e) => handleCellKeyDown(e, p.id, field)}
            rows={3} className="w-full min-w-[200px] px-2 py-1 rounded-lg bg-background border-2 border-primary text-foreground font-body text-sm focus:outline-none resize-y" />
        )}
        <p className="text-xs text-muted-foreground mt-1">Enter salva • Esc cancela</p>
      </div>
    );

    return (
      <div className="relative group cursor-text min-h-[2rem] flex items-start gap-1"
        onClick={(e) => { e.stopPropagation(); startEdit(p, field); }} title="Clique para editar">
        <span className="whitespace-pre-wrap break-words text-foreground">
          {String(p[field] ?? "") || <span className="text-muted-foreground/40 italic text-xs">—</span>}
        </span>
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0 mt-0.5" />}
        {isSaved  && <CheckCircle2 className="w-3 h-3 text-accent shrink-0 mt-0.5 animate-in zoom-in duration-200" />}
        {isError  && <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />}
        {!isSaving && !isSaved && !isError && (
          <span className="absolute inset-0 rounded border border-transparent group-hover:border-primary/30 group-hover:bg-primary/5 transition-all pointer-events-none" />
        )}
      </div>
    );
  };

  // Password gate
  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20">
            <FileSpreadsheet className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary text-glow">Banco de Perguntas</h1>
          <p className="text-muted-foreground font-body">Digite a senha para acessar</p>
          <div className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { passwordInput === ADMIN_PASSWORD ? setAuthenticated(true) : setPasswordError(true); }}}
              placeholder="Senha"
              className="w-full h-14 px-4 rounded-xl bg-card border-2 border-border text-foreground font-body text-lg text-center tracking-widest focus:border-primary focus:outline-none transition-colors"
            />
            {passwordError && <p className="text-destructive font-body text-sm">Senha incorreta. Tente novamente.</p>}
            <button
              onClick={() => { passwordInput === ADMIN_PASSWORD ? setAuthenticated(true) : setPasswordError(true); }}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-display font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 bg-background">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg border font-body text-sm animate-in slide-in-from-top-2 duration-300 ${
          toast.type === "success" ? "bg-accent/10 border-accent/30 text-accent" : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/admin")}
            className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary text-glow">Banco de Perguntas</h1>
            <p className="text-muted-foreground font-body text-sm">
              {total} pergunta(s) cadastrada(s) • Clique em qualquer célula para editar
            </p>
          </div>
        </div>

        {/* Upload + Download */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <p className="font-display font-bold text-foreground">Modelo de Planilha</p>
            </div>
            <p className="text-muted-foreground font-body text-sm">Baixe o modelo, preencha e faça o upload abaixo.</p>
            <button onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all">
              <Download className="w-4 h-4" /> Baixar modelo .xlsx
            </button>
          </div>

          <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all space-y-3 ${
              dragOver ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40 hover:bg-muted"
            }`}>
            <div className="flex items-center gap-2">
              <Upload className={`w-5 h-5 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              <p className="font-display font-bold text-foreground">Upload de Perguntas</p>
            </div>
            {uploading
              ? <div className="flex items-center gap-2 text-primary font-body text-sm"><Loader2 className="w-4 h-4 animate-spin" />Processando...</div>
              : <p className="text-muted-foreground font-body text-sm">Arraste o arquivo .xlsx aqui ou clique para selecionar</p>
            }
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors">
                {allSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
              </button>
              <p className="font-display font-bold text-foreground">
                {selected.size > 0 ? `${selected.size} selecionada(s)` : "Perguntas"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Category filter */}
              {availableCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setSelected(new Set()); }}
                  className="px-3 py-2 rounded-xl bg-background border border-border text-foreground font-body text-sm focus:border-primary focus:outline-none transition-colors"
                >
                  <option value="">Todas as categorias</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}

              {/* Delete entire category */}
              {categoryFilter && (
                <button onClick={handleDeleteByCategory} disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive font-display font-bold text-sm hover:bg-destructive/20 transition-all disabled:opacity-50">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Deletando..." : `Deletar categoria "${categoryFilter}"`}
                </button>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-9 pr-8 py-2 rounded-xl bg-background border border-border text-foreground font-body text-sm focus:border-primary focus:outline-none transition-colors w-48"
                />
                {searchInput && (
                  <button onClick={() => { setSearchInput(""); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Add row */}
              <button onClick={() => { setShowNewRow(true); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/30 text-accent font-display font-bold text-sm hover:bg-accent/20 transition-all">
                <Plus className="w-4 h-4" /> Adicionar
              </button>

              {/* Delete */}
              {selected.size > 0 && (
                <button onClick={handleDelete} disabled={deleting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive font-display font-bold text-sm hover:bg-destructive/20 transition-all disabled:opacity-50">
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deleting ? "Deletando..." : "Deletar"}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="border-b border-border bg-background/40">
                    <th className="w-10 px-4 py-3"></th>
                    {COLUMNS.map((col) => (
                      <th key={col.field}
                        className={`px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs ${col.minWidth} cursor-pointer select-none hover:text-primary transition-colors`}
                        onClick={() => handleSort(col.field)}>
                        <div className="flex items-center gap-1">
                          {col.label}
                          <SortIcon field={col.field} />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* New row form */}
                  {showNewRow && (
                    <tr className="border-b border-primary/30 bg-primary/5">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <button onClick={handleSaveNewRow} disabled={savingNewRow}
                            className="p-1 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-all disabled:opacity-50">
                            {savingNewRow ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                          <button onClick={() => { setShowNewRow(false); setNewRow(EMPTY_NEW_ROW); }}
                            className="p-1 rounded-lg bg-card border border-border text-muted-foreground hover:text-destructive transition-all">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      {COLUMNS.map((col) => {
                        const isShort = col.field === "correta" || col.field === "dificuldade";
                        return (
                          <td key={col.field} className="px-4 py-3">
                            {isShort ? (
                              <input
                                value={newRow[col.field as keyof NewRow]}
                                onChange={(e) => setNewRow((r) => ({ ...r, [col.field]: e.target.value }))}
                                className="w-full px-2 py-1 rounded-lg bg-background border border-border text-foreground font-body text-sm focus:border-primary focus:outline-none uppercase"
                                maxLength={col.field === "correta" ? 1 : 20}
                                placeholder={col.label}
                              />
                            ) : (
                              <textarea
                                value={newRow[col.field as keyof NewRow]}
                                onChange={(e) => setNewRow((r) => ({ ...r, [col.field]: e.target.value }))}
                                rows={2}
                                className="w-full px-2 py-1 rounded-lg bg-background border border-border text-foreground font-body text-sm focus:border-primary focus:outline-none resize-y"
                                placeholder={col.label}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}

                  {displayedPerguntas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-center text-muted-foreground font-body">
                        {search ? "Nenhuma pergunta encontrada para essa busca." : "Nenhuma pergunta cadastrada ainda."}
                      </td>
                    </tr>
                  ) : (
                    displayedPerguntas.map((p, i) => (
                      <tr key={p.id}
                        className={`border-b border-border/50 transition-colors align-top ${
                          selected.has(p.id) ? "bg-primary/5" : i % 2 === 0 ? "bg-transparent" : "bg-background/20"
                        }`}>
                        <td className="px-4 py-3" onClick={(e) => toggleSelect(p.id, e)}>
                          <div className="cursor-pointer pt-1">
                            {selected.has(p.id)
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </td>
                        <td className="px-4 py-3">{renderCell(p, "pergunta")}</td>
                        <td className="px-4 py-3">{renderCell(p, "alternativa_a")}</td>
                        <td className="px-4 py-3">{renderCell(p, "alternativa_b")}</td>
                        <td className="px-4 py-3">{renderCell(p, "alternativa_c")}</td>
                        <td className="px-4 py-3">{renderCell(p, "alternativa_d")}</td>
                        <td className="px-4 py-3">{renderCell(p, "correta")}</td>
                        <td className="px-4 py-3">{renderCell(p, "categoria")}</td>
                        <td className="px-4 py-3">{renderCell(p, "dificuldade")}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <p className="text-muted-foreground font-body text-sm">
                Página {page + 1} de {totalPages} — {total} perguntas
                {search && ` • ${displayedPerguntas.length} resultado(s)`}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
