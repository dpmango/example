import { useContext, useCallback, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import { openExternalLink } from '@utils';
import { UiStoreContext, MethodStoreContext, PayoutStoreContext } from '@store';

// paymentMode - для экранов оплаты выбор ближайший или полный
// paymentSum - если не передать, считается от paymentMode
// methodId - указывается только для привязки или привязки + оплаты
export const usePayout = ({ id, paymentMode, paymentSum, methodId }) => {
  const [loading, setLoading] = useState(false);

  const uiContext = useContext(UiStoreContext);
  const methodContext = useContext(MethodStoreContext);
  const payoutContext = useContext(PayoutStoreContext);
  const { payout } = useContext(PayoutStoreContext);

  const navigate = useNavigate();

  const paymentOptions = useMemo(() => {
    return [
      {
        id: 1,
        value: payoutContext.closestPaymentSum,
        transKey: 'closest',
      },
      {
        id: 2,
        value: payoutContext.payoutSumLeft,
        transKey: 'payAll',
      },
    ];
  }, [payoutContext.closestPaymentSum, payoutContext.payoutSumLeft]);

  const paymentAmount = useMemo(() => {
    try {
      return paymentOptions.find((x) => x.id === paymentMode).value;
    } catch {
      return null;
    }
  }, [paymentOptions, paymentMode]);

  const defaultOrPayoutMethod = useMemo(() => {
    if (payout && payout.paymentMethod) {
      return payout.paymentMethod;
    }

    return methodContext.defaultMethod;
  }, [payout.paymentMethod, methodContext.defaultMethod]);

  const initPayment = useCallback(async () => {
    setLoading(true);

    const res = await payoutContext
      .initPayment({
        id: payout.id,
        sum: paymentSum || paymentAmount,
        paymentMethodId: methodId || defaultOrPayoutMethod.id,
        selectedPlanId: payout.status === 'Active' ? undefined : payoutContext.selectedPlanId,
        returnUrl: `${window.location.origin}/pay/${id}/processing`,
      })
      .catch(({ message, status }) => {
        toast.error(message);
        if (status === 400) {
          uiContext.resetModal();
        }
      });

    setLoading(false);

    if (res) {
      const { data, status } = res;
      handleResponceRedirects(data, status);
      return { data, status };
    }

    return null;
  }, [
    payout.id,
    payout.status,
    paymentAmount,
    paymentSum,
    methodId,
    defaultOrPayoutMethod,
    payoutContext.selectedPlanId,
  ]);

  const initConnect = useCallback(async () => {
    setLoading(true);

    const res = await methodContext.connectMethod({
      paymentMethodId: methodId,
      returnUrl: `${window.location.href}?attachedCallback`,
    });

    setLoading(false);
    if (res) {
      const { data, status } = res;
      handleResponceRedirects(data, status);
      return { data, status };
    }

    return null;
  }, [methodId]);

  const handleResponceRedirects = useCallback((data, status) => {
    if (!data) return;

    if (data.status === 'Failed') {
      uiContext.setModal('error', { text: data.errorDescription });
    } else if (status === 202 && data.redirectUrls) {
      if (data.redirectUrls.type === 'BankSelection') {
        payoutContext.setSBPList(data.redirectUrls.bankSelection);
        navigate(`/pay/${id}/sbp`);
      } else if (data.redirectUrls.type === 'Unconditional') {
        openExternalLink(data.redirectUrls.defaultUrl);
      }
    } else if (data.status === 'InProcess') {
      navigate(`/pay/${id}/processing/${data.id}`);
    } else {
      if (id) payoutContext.getPayout(id);
      uiContext.resetModal();
    }
  }, []);

  return {
    loading,
    paymentOptions,
    paymentAmount,
    defaultOrPayoutMethod,
    initPayment,
    initConnect,
  };
};
