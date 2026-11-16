# Guia de validação do aplicativo Windows

Este guia foi consolidado para evitar instruções duplicadas ou desatualizadas.

**Inicie por [Tutorial de validação humana — passo a passo](VALIDACAO-HUMANA-PASSO-A-PASSO.md).**

O roteiro atualizado contempla:
- exportações **M1** de WINFUT e WDOFUT do Profit Ultra;
- preparação de replay M1 preservado e M2 agregado;
- encerramento WIN **18:25** em novembro de 2026 conforme grade B3;
- possibilidade legítima de início observado depois de 09:00, como 09:03 em 04/11;
- conferência manual da semântica do timestamp Profit, comparação TradingView, OCO, backups e relatórios;
- download de versão de teste do GitHub Actions sem usar terminal.

A janela programada não precisa conter registros no primeiro e último minuto. Diferenças observadas nas bordas são exibidas no catálogo sem impedir a reprodução; metadados inválidos e contratos incompatíveis continuam bloqueados.

Não confunda aprovação da CI com execução prática validada no Windows.
