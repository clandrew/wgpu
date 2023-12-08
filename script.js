async function helloTriangle() {

    if (!navigator.gpu || GPUBufferUsage.COPY_SRC === undefined) {
        document.body.className = 'error';
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    /*** Vertex Buffer Setup ***/

    /* Vertex Data */
    const vertexStride = 8 * 4;
    const vertexDataSize = vertexStride * 3;

    /* GPUBufferDescriptor */
    const vertexDataBufferDescriptor = {
        size: vertexDataSize,
        usage: GPUBufferUsage.VERTEX
    };

    /* GPUBuffer */
    const vertexBuffer = device.createBuffer(vertexDataBufferDescriptor);

    /*** Shader Setup ***/
    const wgslSource = `
                     struct UniformBuffer {
                         modelViewProjectionMatrix : mat4x4<f32>
                     }
                     @binding(0) @group(0) var<uniform> uniforms : UniformBuffer;
  
                     struct Vertex {
                         @builtin(position) Position: vec4<f32>,
                         @location(0) color: vec4<f32>,
                     }

                     @vertex fn vsmain(@builtin(vertex_index) VertexIndex: u32) -> Vertex
                     {
                        // Note: Top right is positive
                        //       Lower left is negative
                        // All triangles are oriented counter-clockwise.

                        var near = 0.5f;
                        var far = 1.0f;
                        var left = -0.5f;
                        var right = 0.5f;
                        var top = 0.5f;
                        var bottom = -0.5f;

                         var pos: array<vec3<f32>, 36> = array<vec3<f32>, 36>(
                             vec3<f32>( left, top, near), vec3<f32>(left, bottom, near), vec3<f32>( right, top, near),                // Front face
                             vec3<f32>( left, bottom, near), vec3<f32>(right, bottom, near), vec3<f32>( right, top, near),

                             vec3<f32>( right, top, near), vec3<f32>(right, bottom, near), vec3<f32>( right, top, far),                // Right face
                             vec3<f32>( right, bottom, near), vec3<f32>(right, bottom, far), vec3<f32>( right, top, far),

                             vec3<f32>( right, top, far), vec3<f32>(right, bottom, far), vec3<f32>( left, top, far),                // Back face
                             vec3<f32>( right, bottom, far), vec3<f32>(left, bottom, far), vec3<f32>( right, top, far),

                             vec3<f32>( left, top, far), vec3<f32>(left, bottom, far), vec3<f32>( left, top, near),                // Left face
                             vec3<f32>( left, bottom, far), vec3<f32>(left, bottom, near), vec3<f32>( left, top, near),

                             vec3<f32>( left, top, far), vec3<f32>(left, top, near), vec3<f32>( right, top, far),                // Top face
                             vec3<f32>( left, top, near), vec3<f32>(right, top, far), vec3<f32>( right, top, near),

                             vec3<f32>( left, bottom, near), vec3<f32>(left, bottom, far), vec3<f32>( right, bottom, near),                // Bottom face
                             vec3<f32>( left, bottom, far), vec3<f32>(right, bottom, near), vec3<f32>( right, bottom, far),
                             
                         );

                         var vertex_out : Vertex;
                         vertex_out.Position = vec4<f32>(pos[VertexIndex], 1.0);

                         vertex_out.Position = uniforms.modelViewProjectionMatrix * vertex_out.Position;

                         return vertex_out;
                     }

                     @fragment fn fsmain(in: Vertex) -> @location(0) vec4<f32>
                     {
                         var r  = sin(in.Position.x / 10.0f);
                         var g  = sin(in.Position.y / 10.0f);
                         var b  = cos((in.Position.x + in.Position.y) / 10.0f);
                         var outColor = vec4<f32>(r, g, b, 1.0);

                         return outColor;
                     }
    `;
    const shaderModule = device.createShaderModule({ code: wgslSource });

    /* GPUPipelineStageDescriptors */
    const vertexStageDescriptor =
    {
        module: shaderModule,
        entryPoint: "vsmain" // Vertex attributes go here if there are any
    };

    /* GPUPipelineLayout */
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: {}
        }
        ]
    });

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
    });

    const fragmentStageDescriptor = { module: shaderModule, entryPoint: "fsmain", targets: [ {format: "bgra8unorm" }, ],  };
    
    /* GPURenderPipelineDescriptor */

    const renderPipelineDescriptor = {
        layout: pipelineLayout,
        vertex: vertexStageDescriptor,
        fragment: fragmentStageDescriptor,
        primitive: {topology: "triangle-list" },
    };
    /* GPURenderPipeline */
    const renderPipeline = device.createRenderPipeline(renderPipelineDescriptor);
    
    /*** Swap Chain Setup ***/
    
    const canvas = document.querySelector("canvas");
    canvas.width = 600;
    canvas.height = 600;

    const gpuContext = canvas.getContext("webgpu");
    
    /* GPUCanvasConfiguration */
    const canvasConfiguration = { device: device, format: "bgra8unorm" };
    gpuContext.configure(canvasConfiguration);
    /* GPUTexture */
    const currentTexture = gpuContext.getCurrentTexture();
    
    /*** Render Pass Setup ***/
    
    /* Acquire Texture To Render To */
    
    /* GPUTextureView */
    const renderAttachment = currentTexture.createView();
    
    /* GPUColor */
    const darkBlue = { r: 0.15, g: 0.15, b: 0.5, a: 1 };
    
    /* GPURenderPassColorATtachmentDescriptor */
    const colorAttachmentDescriptor = {
        view: renderAttachment,
        loadOp: "clear",
        storeOp: "store",
        clearColor: darkBlue
    };
    
    /* GPURenderPassDescriptor */
    const renderPassDescriptor = { colorAttachments: [colorAttachmentDescriptor] };

    /* Bind groups*/
    const uniformBufferSize = 4 * 16; // 4x4 matrix
    const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const uniformBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: uniformBuffer,
                },
            },
        ],
    });
    const transformationMatrix = new Float32Array(16);
    transformationMatrix[0] = 1;
    transformationMatrix[1] = 0;
    transformationMatrix[2] = 0;
    transformationMatrix[3] = 0;

    transformationMatrix[4] = 0;
    transformationMatrix[5] = 1;
    transformationMatrix[6] = 0;
    transformationMatrix[7] = 0;

    transformationMatrix[8] = 0;
    transformationMatrix[9] = 0;
    transformationMatrix[10] = 1;
    transformationMatrix[11] = 0;

    transformationMatrix[12] = 0;
    transformationMatrix[13] = 0;
    transformationMatrix[14] = 0;
    transformationMatrix[15] = 1;
    
    /*** Rendering ***/

    /* GPUQueue */
    const queue = device.queue;

    device.queue.writeBuffer(
        uniformBuffer, /* buffer */
        0, /* buffer offset */
        transformationMatrix, /* data */
        0, /* data offset */
        16 /* size in elements for TypedArray, bytes otherwise */
    );
    
    /* GPUCommandEncoder */
    const commandEncoder = device.createCommandEncoder();
    /* GPURenderPassEncoder */
    const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    
    renderPassEncoder.setPipeline(renderPipeline);

    renderPassEncoder.setBindGroup(0, uniformBindGroup);

    const vertexBufferSlot = 0;
    renderPassEncoder.setVertexBuffer(vertexBufferSlot, vertexBuffer, 0);
    renderPassEncoder.draw(36, 1, 0, 0); // 36 vertices
    renderPassEncoder.end();
    
    /* GPUComamndBuffer */
    const commandBuffer = commandEncoder.finish();

    queue.submit([commandBuffer]);
}

window.addEventListener("DOMContentLoaded", helloTriangle);
