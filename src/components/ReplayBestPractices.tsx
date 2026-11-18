const months = [
  ["Janeiro", "F"], ["Fevereiro", "G"], ["Março", "H"], ["Abril", "J"],
  ["Maio", "K"], ["Junho", "M"], ["Julho", "N"], ["Agosto", "Q"],
  ["Setembro", "U"], ["Outubro", "V"], ["Novembro", "X"], ["Dezembro", "Z"],
];

export function ReplayBestPractices() {
  const year = new Date().getFullYear();
  const suffix = String(year).slice(-2);
  return (
    <section className="card manual-topic replay-best-practices">
      <h3>Melhores práticas para arquivos de replay</h3>
      <p>No Profit Ultra, exporte o CSV pelo código do contrato negociado no pregão desejado.
        Use o mesmo contrato nos arquivos de aquecimento. As séries contínuas WINFUT e WDOFUT
        podem ter ajustes de rolagem que deixam preços fora do tick aceito pelo simulador.</p>
      <p>A letra identifica o mês de vencimento, que pode ser diferente do mês do pregão.
        Os dois últimos dígitos indicam o ano do vencimento. Por exemplo, WINV26 vence em outubro de 2026.</p>
      <table>
        <caption>Códigos por vencimento · exemplos para {year}</caption>
        <thead><tr><th scope="col">Vencimento</th><th scope="col">Mini-índice (WIN)</th><th scope="col">Minidólar (WDO)</th></tr></thead>
        <tbody>{months.map(([month, letter], index) => (
          <tr key={letter}><th scope="row">{month}</th>
            <td>{index % 2 === 1 ? `WIN${letter}${suffix}` : "—"}</td>
            <td>{`WDO${letter}${suffix}`}</td>
          </tr>
        ))}</tbody>
      </table>
      <p>O calendário regular do WIN tem vencimentos nos meses pares. O WDO tem vencimentos mensais.
        Para consultar outro ano, substitua os dois dígitos finais.</p>
    </section>
  );
}
