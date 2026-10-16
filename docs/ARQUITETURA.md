# Arquitetura do Simulador de Trade

## Objetivo

Construir um simulador desktop local para WINFUT e WDOFUT no qual a disciplina operacional seja imposta pelo software.

As duas invariantes centrais são:

1. uma operação só pode ser aberta se houver um sinal ativo do indicador para o mesmo ativo e para a mesma direção;
2. toda entrada precisa nascer protegida por uma OCO com stop loss e alvo válidos.

Essas regras pertencem ao domínio da aplicação. A interface pode desabilitar botões para orientar o usuário, mas o motor também rejeita a operação caso uma chamada inválida tente contornar a interface.

## Stack

- **React + TypeScript** — interface e estado da sessão.
- **Vite** — ambiente de desenvolvimento e build do frontend.
- **Tauri 2 + Rust** — empacotamento desktop e acesso a recursos nativos.
- **SQLite + rusqlite** — persistência local do histórico.
- **Vitest** — testes automatizados das regras de trading.

## Fluxo

```text
Candles / replay
      ↓
IndicatorAdapter
      ↓
Sinal ativo: BUY / SELL / nenhum
      ↓
Motor de regras
      ├── valida ativo
      ├── valida direção
      ├── impede segunda posição
      └── exige OCO coerente
      ↓
Posição simulada
      ↓
Motor OCO
      ├── stop
      └── alvo
      ↓
Trade encerrado
      ↓
Tauri command → Rust → SQLite
```

## Fronteiras do código

### `src/services/indicator.ts`

É a fronteira entre o indicador e o restante do simulador. A interface `IndicatorAdapter` evita acoplar a aplicação inteira ao código do TradingView.

O adaptador atual, `MultiMediasNuvemAdapter`, porta o Pine Script inicial **Multi Médias - Nuvem e Sinais**. Os parâmetros padrão são:

- WMA/MMP: 20 períodos;
- EMA/MME rápida: 8 períodos;
- EMA/MME lenta: 52 períodos;
- VWAP: ancoragem de sessão.

A lógica preserva os dois alinhamentos:

- alta: `EMA 8 > WMA 20 > EMA 52`;
- baixa: `EMA 52 > WMA 20 > EMA 8`.

Uma zona verde só começa quando há alinhamento de alta e um candle de alta. Uma zona vermelha só começa quando há alinhamento de baixa e um candle de baixa. O label de sinal é gerado somente no candle que inicia a zona.

### `src/domain/trading.ts`

Contém as regras que não podem depender de componentes React:

- proibição de entrada sem sinal;
- proibição de direção contrária ao sinal;
- proibição de usar sinal de outro ativo;
- posição única na primeira versão;
- stop e alvo obrigatórios;
- geometria correta da OCO;
- resolução de stop/alvo.

Essa camada é deliberadamente testável sem abrir a interface.

### `src/data/demoMarket.ts`

Gera candles sintéticos somente para exercitar o fluxo do MVP. Não representa histórico real de B3.

### `src/services/persistence.ts`

No aplicativo Tauri, usa comandos Rust e SQLite. No navegador de desenvolvimento, usa `localStorage` como fallback.

### `src-tauri/src/lib.rs`

Abre o banco SQLite dentro da pasta de dados do aplicativo, cria a tabela de operações e expõe os comandos:

- `save_trade`;
- `list_trades`.

## Regra OCO intrabar

Com candles OHLC, pode ocorrer de a mesma barra tocar stop e alvo. Sem ticks ou candles menores, não é possível saber qual nível aconteceu primeiro.

Na fundação atual é usada uma política conservadora: se ambos forem tocados no mesmo candle, considera-se o **stop** primeiro.

Essa política deverá se tornar configurável quando o replay histórico for implementado.

## Candle da entrada

O motor não usa a máxima e a mínima do candle em que a posição acabou de ser aberta para decidir uma saída OCO. Isso evita atribuir ao período posterior à entrada movimentos que podem ter ocorrido antes do clique do usuário.

Com dados intrabar/tick, essa limitação poderá ser substituída por uma simulação mais precisa.

## Decisão sobre OpenTraderWorld

O OpenTraderWorld foi estudado como referência, mas sua base não foi incorporada nesta fase. Ele resolve um problema mais amplo de workspace self-hosted e usa uma infraestrutura muito maior do que a necessária para este simulador.

Manter um núcleo pequeno em React/Tauri/Rust facilita concentrar o projeto em replay, sinais, OCO e treinamento. Componentes ou ideias específicas poderão ser reavaliados posteriormente.

## Política de autorização após o gatilho

O Pine Script distingue o **evento do sinal** do **estado da nuvem**: o label COMPRA/VENDA aparece apenas no candle que inicia a zona, enquanto `in_green_zone` ou `in_red_zone` permanece verdadeiro até o alinhamento correspondente ser perdido.

Para o simulador foi adotada a seguinte política inicial:

1. o evento COMPRA inicia uma autorização BUY;
2. essa autorização permanece enquanto a zona verde estiver ativa;
3. o evento VENDA inicia uma autorização SELL;
4. essa autorização permanece enquanto a zona vermelha estiver ativa;
5. quando não há zona ativa, nenhuma direção pode abrir uma posição.

Essa política mantém a exigência de que toda autorização tenha sido precedida por um gatilho real do indicador e impede que um sinal antigo continue válido depois do fim da nuvem.

Ainda precisa ser definido se um mesmo gatilho poderá autorizar várias operações sequenciais dentro da mesma zona ou apenas a primeira.

## Fidelidade TradingView × simulador

A implementação TypeScript possui testes para os parâmetros padrão, WMA 20, VWAP por sessão e geração de zonas/sinais em tendências controladas.

Quando o replay histórico estiver disponível, deve ser criada uma suíte de regressão com candles reais e resultados conhecidos do TradingView para comparar, candle a candle:

- WMA 20;
- EMA 8;
- EMA 52;
- VWAP;
- estado da zona;
- ocorrência de COMPRA/VENDA.

A ancoragem `Session` da VWAP ainda deverá usar explicitamente o calendário/timezone da sessão da B3 quando o carregador de dados históricos for implementado.
