<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [kibana-plugin-core-public](./kibana-plugin-core-public.md) &gt; [ExecutionContextSetup](./kibana-plugin-core-public.executioncontextsetup.md)

## ExecutionContextSetup interface

Kibana execution context. Used to provide execution context to Elasticsearch, reporting, performance monitoring, etc.

<b>Signature:</b>

```typescript
export interface ExecutionContextSetup 
```

## Properties

|  Property | Type | Description |
|  --- | --- | --- |
|  [context$](./kibana-plugin-core-public.executioncontextsetup.context_.md) | Observable&lt;KibanaExecutionContext&gt; | The current context observable |

## Methods

|  Method | Description |
|  --- | --- |
|  [clear()](./kibana-plugin-core-public.executioncontextsetup.clear.md) | clears the context |
|  [get()](./kibana-plugin-core-public.executioncontextsetup.get.md) | Get the current top level context |
|  [getAsLabels()](./kibana-plugin-core-public.executioncontextsetup.getaslabels.md) | returns apm labels |
|  [set(c$)](./kibana-plugin-core-public.executioncontextsetup.set.md) | Set the current top level context |
|  [withGlobalContext(context)](./kibana-plugin-core-public.executioncontextsetup.withglobalcontext.md) | merges the current top level context with the specific event context |

