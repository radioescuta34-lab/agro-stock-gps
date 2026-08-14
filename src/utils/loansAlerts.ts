import { ComponentLoan } from '../types';

export function getOverdueLoans(loans: ComponentLoan[], todayStr?: string): ComponentLoan[] {
  const today = todayStr || new Date().toISOString().split('T')[0];
  return loans.filter(
    l => l.status === 'Ativo' && l.estimatedReturnDate && l.estimatedReturnDate < today
  );
}

export async function sendLoansAlertEmail(alertEmails: string[], loans: ComponentLoan[]) {
  try {
    const payload = {
      alertEmails,
      loans: loans.map(l => ({
        id: l.id,
        contractNumber: l.contractNumber,
        thirdPartyName: l.thirdPartyName,
        thirdPartyDocument: l.thirdPartyDocument,
        thirdPartyCompany: l.thirdPartyCompany,
        loanDate: l.loanDate,
        estimatedReturnDate: l.estimatedReturnDate,
        items: l.items
      }))
    };

    const res = await fetch('/api/loans/send-alert-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha no envio de e-mail pela API');
    }
    return { success: true, message: data.message, simulated: data.simulated };
  } catch (err: any) {
    console.error('Erro ao enviar alerta de empréstimos vencidos:', err);
    return { success: false, message: err.message || 'Erro de conexão' };
  }
}