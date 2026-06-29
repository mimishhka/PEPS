import { useCallback, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { toast } from "sonner";

export function useAdminApi() {
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (fn, { successMsg = null } = {}) => {
    setLoading(true);
    try {
      const result = await fn();
      if (successMsg) toast.success(successMsg);
      return { ok: true, data: result };
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
      return { ok: false, error: e };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, run, api };
}
