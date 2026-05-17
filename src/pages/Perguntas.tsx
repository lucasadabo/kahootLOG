import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Upload, Trash2, CheckSquare, Square, ChevronLeft, ChevronRight, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
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

const PAGE_SIZE = 100;

export default function Perguntas() {
  const navigate = useNavigate();

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

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPerguntas = useCallback(async () => {
    setLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await gameSupabase
        .from("perguntas")
        .select("*", { count: "exact" })
        .order("categoria", { ascending: true })
        .range(from, to);

      if (error) throw error;
      setPerguntas(data ?? []);
      setTotal(count ?? 0);
      setSelected(new Set());
    } catch (err) {
      showToast("error", "Erro ao carregar perguntas.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchPerguntas();
  }, [fetchPerguntas]);

  // Download template XLSX
  const handleDownloadTemplate = () => {
    const headers = [["pergunta", "alternativa_a", "alternativa_b", "alternativa_c", "alternativa_d", "correta", "categoria", "dificuldade"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws["!cols"] = [
      { wch: 60 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
      { wch: 10 }, { wch: 20 }, { wch: 15 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Perguntas");
    XLSX.writeFile(wb, "modelo_perguntas.xlsx");
  };

  // Parse and upload XLSX
  const processFile = async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      showToast("error", "Apenas arquivos .xlsx ou .xls são aceitos.");
      return;
    }

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws);

      if (rows.length === 0) {
        showToast("error", "Planilha vazia ou sem dados.");
        return;
      }

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

      if (inserts.length === 0) {
        showToast("error", "Nenhuma linha válida encontrada. Verifique os títulos das colunas.");
        return;
      }

      const { error } = await gameSupabase.from("perguntas").insert(inserts);
      if (error) throw error;

      showToast("success", `${inserts.length} pergunta(s) inserida(s) com sucesso!`);
      setPage(0);
      fetchPerguntas();
    } catch (err) {
      console.error(err);
      showToast("error", "Erro ao processar o arquivo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // Selection
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === perguntas.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(perguntas.map((p) => p.id)));
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Deletar ${selected.size} pergunta(s)? Esta ação não pode ser desfeita.`)) return;

    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await gameSupabase.from("perguntas").delete().in("id", ids);
      if (error) throw error;
      showToast("success", `${ids.length} pergunta(s) deletada(s).`);
      setPage(0);
      fetchPerguntas();
    } catch (err) {
      showToast("error", "Erro ao deletar perguntas.");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = perguntas.length > 0 && selected.size === perguntas.length;

  return (
    <div className="min-h-screen flex flex-col px-4 py-6 bg-background">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-lg border font-body text-sm animate-in slide-in-from-top-2 duration-300 ${
          toast.type === "success"
            ? "bg-accent/10 border-accent/30 text-accent"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin")}
            className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary text-glow">Banco de Perguntas</h1>
            <p className="text-muted-foreground font-body text-sm">{total} pergunta(s) cadastrada(s)</p>
          </div>
        </div>

        {/* Upload + Download */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Download template */}
          <div className="p-5 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <p className="font-display font-bold text-foreground">Modelo de Planilha</p>
            </div>
            <p className="text-muted-foreground font-body text-sm">
              Baixe o modelo, preencha com as perguntas e faça o upload abaixo.
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Download className="w-4 h-4" />
              Baixar modelo .xlsx
            </button>
          </div>

          {/* Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all space-y-3 ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted"
            }`}
          >
            <div className="flex items-center gap-2">
              <Upload className={`w-5 h-5 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
              <p className="font-display font-bold text-foreground">Upload de Perguntas</p>
            </div>
            {uploading ? (
              <div className="flex items-center gap-2 text-primary font-body text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processando...
              </div>
            ) : (
              <p className="text-muted-foreground font-body text-sm">
                Arraste o arquivo .xlsx aqui ou clique para selecionar
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl bg-card border border-border overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition-colors">
                {allSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5" />}
              </button>
              <p className="font-display font-bold text-foreground">
                {selected.size > 0 ? `${selected.size} selecionada(s)` : "Perguntas"}
              </p>
            </div>
            {selected.size > 0 && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive font-display font-bold text-sm hover:bg-destructive/20 transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? "Deletando..." : "Deletar selecionadas"}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : perguntas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 opacity-30" />
              <p className="font-body">Nenhuma pergunta cadastrada ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="border-b border-border bg-background/40">
                    <th className="w-10 px-4 py-3"></th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">Pergunta</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">A</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">B</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">C</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">D</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">Correta</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">Categoria</th>
                    <th className="px-4 py-3 text-left text-muted-foreground font-display font-bold uppercase tracking-wider text-xs">Dificuldade</th>
                  </tr>
                </thead>
                <tbody>
                  {perguntas.map((p, i) => (
                    <tr
                      key={p.id}
                      className={`border-b border-border/50 transition-colors ${
                        selected.has(p.id) ? "bg-primary/5" : i % 2 === 0 ? "bg-transparent" : "bg-background/20"
                      } hover:bg-muted cursor-pointer`}
                      onClick={() => toggleSelect(p.id)}
                    >
                      <td className="px-4 py-3">
                        {selected.has(p.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-xs">
                        <span className="line-clamp-2">{p.pergunta}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]">
                        <span className="line-clamp-1">{p.alternativa_a}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]">
                        <span className="line-clamp-1">{p.alternativa_b}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]">
                        <span className="line-clamp-1">{p.alternativa_c}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[120px]">
                        <span className="line-clamp-1">{p.alternativa_d}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-accent/20 text-accent font-display font-bold">
                          {p.correta}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.categoria && (
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary font-body text-xs">
                            {p.categoria}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{p.dificuldade ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <p className="text-muted-foreground font-body text-sm">
                Página {page + 1} de {totalPages} — {total} perguntas
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
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
