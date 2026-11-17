"""Extrai o texto de um PDF oficial para fontes/texto/<id>.txt (uma linha por linha do PDF).

Uso: python -I scripts/extrair-pdf.py <arquivo.pdf> <saida.txt>
"""
import sys
from pypdf import PdfReader

leitor = PdfReader(sys.argv[1])
with open(sys.argv[2], "w", encoding="utf-8") as saida:
    for i, pagina in enumerate(leitor.pages, 1):
        saida.write(f"\f[[pagina {i}]]\n")
        saida.write((pagina.extract_text() or "") + "\n")
print(f"{len(leitor.pages)} páginas")
