export interface GlobalValidationPipeOptions {
  whitelist: boolean;
  forbidNonWhitelisted: boolean;
  transform: boolean;
}

export function getGlobalValidationPipeConfig(): GlobalValidationPipeOptions {
  return {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  };
}
