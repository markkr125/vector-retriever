jest.mock('googleapis', () => {
  const listMock = jest.fn();
  const getMock = jest.fn();
  const driveMock = jest.fn(() => ({
    files: {
      list: listMock,
      get: getMock
    }
  }));

  return {
    google: { drive: driveMock },
    __private: { listMock, getMock, driveMock }
  };
});

const { __private } = require('googleapis');

const {
  analyzeGoogleDriveFolder,
  downloadGoogleDriveFile
} = require('../../../services/cloud-import-service');

describe('cloud-import-service (unit) - Google Drive error mapping', () => {
  beforeEach(() => {
    process.env.GOOGLE_DRIVE_API_KEY = 'test-key';
    jest.spyOn(console, 'error').mockImplementation(() => {});
    __private.listMock.mockReset();
    __private.getMock.mockReset();
    __private.driveMock.mockClear();
  });

  afterEach(() => {
    delete process.env.GOOGLE_DRIVE_API_KEY;
    jest.restoreAllMocks();
  });

  test('analyzeGoogleDriveFolder maps accessNotConfigured to Drive API disabled message', async () => {
    __private.listMock.mockRejectedValueOnce({
      code: 403,
      response: {
        status: 403,
        data: {
          error: {
            errors: [
              {
                message:
                  'Google Drive API has not been used in project 45858318810 before or it is disabled.',
                domain: 'usageLimits',
                reason: 'accessNotConfigured',
                extendedHelp: 'https://console.developers.google.com'
              }
            ],
            code: 403,
            message:
              'Google Drive API has not been used in project 45858318810 before or it is disabled.'
          }
        }
      },
      message: 'Request failed'
    });

    await expect(
      analyzeGoogleDriveFolder('https://drive.google.com/drive/folders/FAKE_FOLDER', {
        abortSignal: new AbortController().signal
      })
    ).rejects.toThrow(/not enabled.*accessNotConfigured|accessNotConfigured.*not enabled/i);
  });

  test('analyzeGoogleDriveFolder keeps share/permission guidance for generic 403', async () => {
    __private.listMock.mockRejectedValueOnce({
      code: 403,
      response: {
        status: 403,
        data: {
          error: {
            errors: [
              {
                message: 'The caller does not have permission',
                domain: 'global',
                reason: 'forbidden'
              }
            ],
            code: 403,
            message: 'The caller does not have permission'
          }
        }
      },
      message: 'Request failed'
    });

    await expect(
      analyzeGoogleDriveFolder('https://drive.google.com/drive/folders/FAKE_FOLDER', {
        abortSignal: new AbortController().signal
      })
    ).rejects.toThrow(/Anyone with the link can view/i);
  });

  test('downloadGoogleDriveFile maps accessNotConfigured to Drive API disabled message', async () => {
    __private.getMock.mockRejectedValueOnce({
      code: 403,
      response: {
        status: 403,
        data: {
          error: {
            errors: [
              {
                message: 'Drive API disabled',
                domain: 'usageLimits',
                reason: 'accessNotConfigured'
              }
            ],
            code: 403,
            message: 'Drive API disabled'
          }
        }
      },
      message: 'Request failed'
    });

    await expect(
      downloadGoogleDriveFile({ id: 'g1', name: 'doc1.txt' })
    ).rejects.toThrow(/accessNotConfigured/i);
  });
});
