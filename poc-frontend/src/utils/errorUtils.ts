
export const analyzeCoverageErrors = (files: { file: string; coverage: number; error?: string }[]) => {
  const filesWithErrors = files.filter(f => f.error && f.error.trim() !== '');
  
  const errorTypes: Record<string, number> = {};
  filesWithErrors.forEach(file => {
    const error = file.error || '';
    
    if (error.includes('undefined reference')) {
      errorTypes['Reference Errors'] = (errorTypes['Reference Errors'] || 0) + 1;
    } else if (error.includes('cannot find')) {
      errorTypes['Import Errors'] = (errorTypes['Import Errors'] || 0) + 1;
    } else if (error.includes('syntax')) {
      errorTypes['Syntax Errors'] = (errorTypes['Syntax Errors'] || 0) + 1;
    } else if (error.includes('permission denied')) {
      errorTypes['Permission Errors'] = (errorTypes['Permission Errors'] || 0) + 1;
    } else if (error.includes('timeout')) {
      errorTypes['Timeout Errors'] = (errorTypes['Timeout Errors'] || 0) + 1;
    } else {
      errorTypes['Other Errors'] = (errorTypes['Other Errors'] || 0) + 1;
    }
  });
  
  return {
    totalErrors: filesWithErrors.length,
    errorTypes,
    filesWithErrors,
    hasErrors: filesWithErrors.length > 0
  };
};

export const getErrorSummary = (files: { file: string; coverage: number; error?: string }[]) => {
  const analysis = analyzeCoverageErrors(files);
  
  if (!analysis.hasErrors) {
    return null;
  }
  
  const errorTypeDescriptions = Object.entries(analysis.errorTypes)
    .map(([type, count]) => `${count} ${type.toLowerCase()}`)
    .join(', ');
  
  return {
    count: analysis.totalErrors,
    summary: `Found ${analysis.totalErrors} file(s) with errors: ${errorTypeDescriptions}`,
    analysis
  };
};

export default {
  analyzeCoverageErrors,
  getErrorSummary
};
