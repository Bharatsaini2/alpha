import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TelegramSubscription from '../TelegramSubscription';
import api from '../../../lib/api';
import { ToastProvider } from '../../../components/ui/Toast';

// Mock the API
vi.mock('../../../lib/api');

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockSubscriptions = [
  {
    _id: 'sub1',
    type: 'ALPHA_STREAM',
    priority: 'LOW',
    enabled: true,
    config: {
      hotnessScoreThreshold: 7,
      walletLabels: ['Sniper', 'Smart Money'],
      minBuyAmountUSD: 1000,
    },
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z',
  },
  {
    _id: 'sub2',
    type: 'ALPHA_STREAM',
    priority: 'LOW',
    enabled: false,
    config: {
      hotnessScoreThreshold: 5,
      walletLabels: ['Insider'],
      minBuyAmountUSD: 500,
    },
    createdAt: '2024-01-14T08:20:00Z',
    updatedAt: '2024-01-14T08:20:00Z',
  },
];

const renderComponent = () => {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <TelegramSubscription />
      </ToastProvider>
    </BrowserRouter>
  );
};

describe('TelegramSubscription Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Subscription Display', () => {
    it('should display loading state initially', () => {
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));
      
      renderComponent();
      
      expect(screen.getByText('Loading subscriptions...')).toBeInTheDocument();
    });

    it('should display subscriptions after successful fetch', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: mockSubscriptions,
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('[ 2 ]')).toBeInTheDocument();
      });

      expect(screen.getByText('Whale Alert')).toBeInTheDocument();
    });

    it('should display correct subscription count', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: mockSubscriptions,
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('[ 2 ]')).toBeInTheDocument();
      });
    });

    it('should display empty state when no subscriptions', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('No active subscriptions found.')).toBeInTheDocument();
      });
    });

    it('should display error message on fetch failure', async () => {
      const errorMessage = 'Network error';
      vi.mocked(api.get).mockRejectedValueOnce({
        response: {
          data: {
            message: errorMessage,
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should display subscription configuration details', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      await waitFor(() => {
        expect(screen.getByText(/Hotness: 7\/10/)).toBeInTheDocument();
        expect(screen.getByText(/Min Buy: \$1,000/)).toBeInTheDocument();
        expect(screen.getByText(/Labels: Sniper, Smart Money/)).toBeInTheDocument();
      });
    });

    it('should display active status badge for enabled subscriptions', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
      });
    });
  });

  describe('Delete Confirmation Dialog', () => {
    it('should show confirmation dialog when delete button is clicked', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Confirmation buttons should appear
      await waitFor(() => {
        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });

    it('should hide confirmation dialog when cancel is clicked', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click cancel
      const cancelButton = await screen.findByText('Cancel');
      fireEvent.click(cancelButton);

      // Confirmation buttons should disappear
      await waitFor(() => {
        expect(screen.queryByText('Confirm Delete')).not.toBeInTheDocument();
        expect(screen.getByText('Delete Subscription')).toBeInTheDocument();
      });
    });
  });

  describe('API Integration', () => {
    it('should call API to fetch subscriptions on mount', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: mockSubscriptions,
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/alerts/whale-alerts');
      });
    });

    it('should call delete API when deletion is confirmed', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      vi.mocked(api.delete).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Subscription deleted successfully',
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click confirm
      const confirmButton = await screen.findByText('Confirm Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/alerts/whale-alert/sub1');
      });
    });

    it('should remove subscription from display after successful deletion', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: mockSubscriptions,
          },
        },
      });

      vi.mocked(api.delete).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Subscription deleted successfully',
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('[ 2 ]')).toBeInTheDocument();
      });

      // Click to expand first accordion
      const accordionButtons = screen.getAllByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButtons[0]);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click confirm
      const confirmButton = await screen.findByText('Confirm Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('[ 1 ]')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when deletion fails', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      const errorMessage = 'Failed to delete subscription';
      vi.mocked(api.delete).mockRejectedValueOnce({
        response: {
          data: {
            message: errorMessage,
          },
        },
      });

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click confirm
      const confirmButton = await screen.findByText('Confirm Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should handle generic API errors gracefully', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Failed to load subscriptions')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state during deletion', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      vi.mocked(api.delete).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click confirm
      const confirmButton = await screen.findByText('Confirm Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument();
      });
    });

    it('should disable buttons during deletion', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            alerts: [mockSubscriptions[0]],
          },
        },
      });

      vi.mocked(api.delete).mockImplementation(() => new Promise(() => {}));

      renderComponent();

      await waitFor(() => {
        expect(screen.getByText('Whale Alert')).toBeInTheDocument();
      });

      // Click to expand accordion
      const accordionButton = screen.getByRole('button', { name: /Whale Alert/i });
      fireEvent.click(accordionButton);

      // Click delete button
      const deleteButton = await screen.findByText('Delete Subscription');
      fireEvent.click(deleteButton);

      // Click confirm
      const confirmButton = await screen.findByText('Confirm Delete');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        const deletingButton = screen.getByText('Deleting...');
        expect(deletingButton).toBeDisabled();
      });
    });
  });
});
