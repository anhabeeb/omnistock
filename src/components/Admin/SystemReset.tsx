import { useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

export const SystemReset = () => {
  const [step, setStep] = useState<'initial' | 'otp' | 'executing'>('initial');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const requestOtp = async () => {
    setLoading(true);
    try {
      await axios.post('/api/system-reset/request-otp');
      toast.success('OTP sent to your email');
      setStep('otp');
    } catch (error) {
      toast.error('Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/system-reset/verify-otp', { otp });
      setResetToken(response.data.token);
      toast.success('OTP verified');
    } catch (error) {
      toast.error('Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const executeReset = async () => {
    if (confirmation !== 'RESET ENTIRE DATABASE') {
      toast.error('Invalid confirmation phrase');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/system-reset/execute', { token: resetToken, confirmation });
      toast.success('System reset successfully');
      window.location.href = '/setup'; // Redirect to setup
    } catch (error) {
      toast.error('Failed to reset system');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-red-50 rounded-xl border border-red-200">
      <h2 className="text-xl font-bold text-red-800 flex items-center gap-2">
        <AlertTriangle /> Danger Zone: System Reset
      </h2>
      <p className="text-red-700 mt-2">
        This will permanently delete ALL data in the database. This action is irreversible.
      </p>

      {step === 'initial' && (
        <button
          onClick={requestOtp}
          disabled={loading}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Send />} Request OTP
        </button>
      )}

      {step === 'otp' && !resetToken && (
        <div className="mt-4">
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter 6-digit OTP"
            className="border p-2 rounded-lg w-full"
          />
          <button
            onClick={verifyOtp}
            disabled={loading}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Verify OTP'}
          </button>
        </div>
      )}

      {resetToken && (
        <div className="mt-4">
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="Type 'RESET ENTIRE DATABASE' to confirm"
            className="border p-2 rounded-lg w-full"
          />
          <button
            onClick={executeReset}
            disabled={loading || confirmation !== 'RESET ENTIRE DATABASE'}
            className="mt-2 bg-red-800 text-white px-4 py-2 rounded-lg font-bold"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'EXECUTE WIPE'}
          </button>
        </div>
      )}
    </div>
  );
};
